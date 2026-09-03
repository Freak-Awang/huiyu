package com.im.server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.im.common.dto.MessageVO;
import com.im.common.dto.SendMessageRequest;
import com.im.common.entity.ImConversation;
import com.im.common.entity.ImConversationMember;
import com.im.common.entity.ImFile;
import com.im.common.entity.ImMessage;
import com.im.common.entity.ImMessageDelivery;
import com.im.common.entity.SysUser;
import com.im.common.exception.BusinessException;
import com.im.common.result.PageResult;
import com.im.server.mapper.ConversationMapper;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.MessageDeliveryMapper;
import com.im.server.mapper.MessageMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.service.FileMetadataService;
import com.im.server.service.ImageTypeDetector;
import com.im.server.service.MessageService;
import com.im.server.websocket.WebSocketSessionManager;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 消息服务实现：处理消息发送落库、撤回、已读回执、离线消息同步及消息清理。
 * <p>
 * 核心流程：发送消息时先写 im_message，再为每个会话成员写 im_message_delivery，
 * 最后更新会话最后消息预览；撤回和已读通过 WebSocket 实时推送状态变更。
 */
@Service
public class MessageServiceImpl implements MessageService {

    private static final int RECALL_LIMIT_MINUTES = 2;
    private static final int MAX_PAGE_SIZE = 100;
    private static final int MAX_PENDING_LIMIT = 500;
    private static final String MESSAGE_TYPE_TEXT = "TEXT";
    private static final String MESSAGE_TYPE_IMAGE = "IMAGE";
    private static final String MESSAGE_TYPE_FILE = "FILE";
    private static final String MESSAGE_TYPE_STICKER = "STICKER";
    private static final String MESSAGE_TYPE_SHAKE = "SHAKE";
    private static final String MESSAGE_TYPE_FOLDER = "FOLDER";
    private static final String MENTION_TYPE_ALL = "all";
    private static final String MENTION_ALL_USER_ID = "__ALL__";

    @Autowired
    private MessageMapper messageMapper;

    @Autowired
    private MessageDeliveryMapper messageDeliveryMapper;

    @Autowired
    private ConversationMapper conversationMapper;

    @Autowired
    private ConversationMemberMapper conversationMemberMapper;

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private WebSocketSessionManager sessionManager;

    @Autowired
    private FileMetadataService fileMetadataService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public PageResult<MessageVO> getMessages(Long userId, Long conversationId, Long beforeMessageId, int pageSize) {
        pageSize = normalizeLimit(pageSize, 20, MAX_PAGE_SIZE);
        ImConversationMember member = conversationMemberMapper.selectOne(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversationId)
                        .eq(ImConversationMember::getUserId, userId));
        if (member == null) {
            throw new BusinessException(403, "Not a member of this conversation");
        }

        Long total = messageMapper.selectCount(
                new LambdaQueryWrapper<ImMessage>()
                        .eq(ImMessage::getConversationId, conversationId));

        LambdaQueryWrapper<ImMessage> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ImMessage::getConversationId, conversationId);
        if (beforeMessageId != null) {
            wrapper.lt(ImMessage::getId, beforeMessageId);
        }
        wrapper.orderByDesc(ImMessage::getCreateTime);
        wrapper.last("LIMIT " + pageSize);

        List<ImMessage> messages = messageMapper.selectList(wrapper);
        List<MessageVO> voList = toMessageVOList(messages, userId);

        return PageResult.success(voList, total, 1, pageSize);
    }

    @Override
    public PageResult<MessageVO> searchMessages(Long userId, Long conversationId, String keyword, int pageSize) {
        pageSize = normalizeLimit(pageSize, 20, MAX_PAGE_SIZE);
        ImConversationMember member = conversationMemberMapper.selectOne(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversationId)
                        .eq(ImConversationMember::getUserId, userId));
        if (member == null) {
            throw new BusinessException(403, "Not a member of this conversation");
        }
        if (!StringUtils.hasText(keyword)) {
            return PageResult.success(List.of(), 0, 1, pageSize);
        }

        LambdaQueryWrapper<ImMessage> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ImMessage::getConversationId, conversationId)
                .ne(ImMessage::getStatus, "RECALLED")
                .like(ImMessage::getContent, keyword)
                .orderByDesc(ImMessage::getCreateTime)
                .last("LIMIT " + pageSize);

        List<MessageVO> voList = toMessageVOList(messageMapper.selectList(wrapper), userId);
        return PageResult.success(voList, voList.size(), 1, pageSize);
    }

    /**
     * 发送消息。
     * <p>
     * 核心流程：校验成员身份与消息权限 → 通过 clientMsgId 实现幂等去重 →
     * 写入 im_message → 同步创建所有成员的 delivery 记录 → 更新会话最后消息预览。
     * 使用 clientMsgId 防止网络重试或客户端恢复导致的消息重复。
     */
    @Override
    @Transactional
    public ImMessage sendMessage(Long senderId, SendMessageRequest request) {
        validateSendRequest(request);
        // 发送消息的核心边界：先确认成员身份和业务权限，再写消息与 delivery rows，保证离线同步有数据可拉取。
        LambdaQueryWrapper<ImConversationMember> memberWrapper = new LambdaQueryWrapper<>();
        memberWrapper.eq(ImConversationMember::getConversationId, request.getConversationId())
                .eq(ImConversationMember::getUserId, senderId);
        ImConversationMember member = conversationMemberMapper.selectOne(memberWrapper);
        if (member == null) {
            throw new BusinessException(403, "Not a member of this conversation");
        }
        validateSupportedMessageType(request);
        validateMediaMessage(request);
        validateAllMentionPermission(request, member);

        if (StringUtils.hasText(request.getClientMsgId())) {
            // clientMsgId provides idempotency for retries from unstable network or desktop resume.
            LambdaQueryWrapper<ImMessage> dupWrapper = new LambdaQueryWrapper<>();
            dupWrapper.eq(ImMessage::getSenderId, senderId)
                    .eq(ImMessage::getClientMsgId, request.getClientMsgId());
            ImMessage existing = messageMapper.selectOne(dupWrapper);
            if (existing != null) {
                return existing;
            }
        }

        ImMessage message = new ImMessage();
        message.setConversationId(request.getConversationId());
        message.setSenderId(senderId);
        message.setMessageType(request.getMessageType());
        message.setContent(request.getContent());
        message.setStatus("SENT");
        message.setClientMsgId(request.getClientMsgId());
        message.setCreateTime(LocalDateTime.now());
        message.setExpiresAt(null);

        try {
            messageMapper.insert(message);
        } catch (DuplicateKeyException e) {
            if (StringUtils.hasText(request.getClientMsgId())) {
                ImMessage existing = messageMapper.selectOne(
                        new LambdaQueryWrapper<ImMessage>()
                                .eq(ImMessage::getSenderId, senderId)
                                .eq(ImMessage::getClientMsgId, request.getClientMsgId()));
                if (existing != null) {
                    return existing;
                }
            }
            throw e;
        }
        // Delivery rows are created synchronously so unread counts and pending-message replay stay consistent.
        createDeliveryRows(message);

        ImConversation conversation = conversationMapper.selectById(request.getConversationId());
        if (conversation != null) {
            conversation.setLastMessage(getMessagePreview(request.getMessageType(), request.getContent()));
            conversation.setLastMessageTime(LocalDateTime.now());
            conversationMapper.updateById(conversation);
        }

        member.setLastReadTime(LocalDateTime.now());
        conversationMemberMapper.updateById(member);

        return message;
    }

    @Override
    @Transactional
    public MessageVO recallMessage(Long userId, Long messageId) {
        // 撤回只允许发送者在短窗口内执行，并通过 WebSocket 推送让在线端替换本地消息状态。
        ImMessage message = messageMapper.selectById(messageId);
        if (message == null) {
            throw new BusinessException(404, "Message not found");
        }
        if (!userId.equals(message.getSenderId())) {
            throw new BusinessException(403, "Only the sender can recall this message");
        }
        if (message.getCreateTime() != null
                && message.getCreateTime().isBefore(LocalDateTime.now().minusMinutes(RECALL_LIMIT_MINUTES))) {
            throw new BusinessException(409, "Messages can only be recalled within 2 minutes");
        }

        message.setStatus("RECALLED");
        message.setContent("");
        messageMapper.updateById(message);
        updateConversationPreviewAfterRecall(message);
        pushMessageUpdated(message);
        return toMessageVO(message, userId);
    }

    @Override
    public List<MessageVO> getPendingMessages(Long userId, int limit) {
        limit = normalizeLimit(limit, 100, MAX_PENDING_LIMIT);
        List<ImMessageDelivery> pendingDeliveries = messageDeliveryMapper.selectList(
                new LambdaQueryWrapper<ImMessageDelivery>()
                        .eq(ImMessageDelivery::getUserId, userId)
                        .eq(ImMessageDelivery::getDelivered, 0)
                        .orderByAsc(ImMessageDelivery::getCreateTime)
                        .last("LIMIT " + limit));

        List<Long> messageIds = pendingDeliveries.stream()
                .map(ImMessageDelivery::getMessageId)
                .filter(Objects::nonNull)
                .toList();
        if (messageIds.isEmpty()) {
            return List.of();
        }
        Map<Long, ImMessage> byId = messageMapper.selectBatchIds(messageIds).stream()
                .collect(Collectors.toMap(ImMessage::getId, Function.identity()));
        List<ImMessage> messages = messageIds.stream()
                .map(byId::get)
                .filter(Objects::nonNull)
                .toList();
        return toMessageVOList(messages, userId);
    }

    @Override
    @Transactional
    public void acknowledgeMessage(Long userId, Long messageId) {
        ImMessageDelivery delivery = messageDeliveryMapper.selectOne(
                new LambdaQueryWrapper<ImMessageDelivery>()
                        .eq(ImMessageDelivery::getMessageId, messageId)
                        .eq(ImMessageDelivery::getUserId, userId));
        if (delivery == null) {
            return;
        }
        if (delivery.getDelivered() != null && delivery.getDelivered() == 1) {
            return;
        }
        delivery.setDelivered(1);
        delivery.setDeliveredTime(LocalDateTime.now());
        messageDeliveryMapper.updateById(delivery);
    }

    /**
     * 标记会话已读至指定消息。
     * <p>
     * 通过边界消息时间 + 消息 ID 双重条件确定已读范围，批量更新 delivery 表 read_status，
     * 并向同会话其他在线成员推送已读回执，实现多端已读状态同步。
     */
    @Override
    @Transactional
    public void markConversationRead(Long userId, Long conversationId, Long lastReadMessageId) {
        ImConversationMember member = conversationMemberMapper.selectOne(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversationId)
                        .eq(ImConversationMember::getUserId, userId));
        if (member == null) {
            throw new BusinessException(403, "Not a member of this conversation");
        }

        LocalDateTime readAt = LocalDateTime.now();
        LocalDateTime boundaryTime = readAt;
        Long effectiveLastReadMessageId = lastReadMessageId;
        if (lastReadMessageId != null) {
            ImMessage boundaryMessage = messageMapper.selectById(lastReadMessageId);
            if (boundaryMessage == null || !conversationId.equals(boundaryMessage.getConversationId())) {
                throw new BusinessException(400, "Invalid last read message");
            }
            boundaryTime = boundaryMessage.getCreateTime() != null ? boundaryMessage.getCreateTime() : boundaryTime;
        } else {
            ImMessage latestMessage = messageMapper.selectOne(
                    new LambdaQueryWrapper<ImMessage>()
                            .eq(ImMessage::getConversationId, conversationId)
                            .orderByDesc(ImMessage::getCreateTime)
                            .orderByDesc(ImMessage::getId)
                            .last("LIMIT 1"));
            if (latestMessage != null) {
                effectiveLastReadMessageId = latestMessage.getId();
            }
        }

        List<Long> newlyReadMessageIds = effectiveLastReadMessageId == null
                ? List.of()
                : messageDeliveryMapper.selectUnreadMessageIdsUpTo(
                        conversationId, userId, boundaryTime, effectiveLastReadMessageId);
        int updated = effectiveLastReadMessageId == null
                ? 0
                : messageDeliveryMapper.markReadUpTo(
                        conversationId, userId, boundaryTime, effectiveLastReadMessageId, readAt);

        if (member.getLastReadTime() == null || member.getLastReadTime().isBefore(readAt)) {
            member.setLastReadTime(readAt);
            conversationMemberMapper.updateById(member);
        }

        if (updated > 0) {
            pushConversationRead(conversationId, userId, effectiveLastReadMessageId, readAt, newlyReadMessageIds);
        }
    }

    @Override
    @Transactional
    public void cleanupExpiredMessages() {
        // Chat messages are retained permanently. This method remains for API compatibility
        // with older cleanup scheduling code and intentionally performs no deletion.
    }

    private void createDeliveryRows(ImMessage message) {
        // 每个成员一条 delivery 记录；发送者立即标记 delivered/read，其他成员等待 ACK 或 read receipt。
        List<ImConversationMember> members = conversationMemberMapper.selectList(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, message.getConversationId()));
        LocalDateTime now = LocalDateTime.now();
        for (ImConversationMember member : members) {
            ImMessageDelivery delivery = new ImMessageDelivery();
            delivery.setMessageId(message.getId());
            delivery.setConversationId(message.getConversationId());
            delivery.setUserId(member.getUserId());
            delivery.setDelivered(member.getUserId().equals(message.getSenderId()) ? 1 : 0);
            delivery.setDeliveredTime(member.getUserId().equals(message.getSenderId()) ? now : null);
            delivery.setReadStatus(member.getUserId().equals(message.getSenderId()) ? 1 : 0);
            delivery.setReadTime(member.getUserId().equals(message.getSenderId()) ? now : null);
            delivery.setCreateTime(now);
            messageDeliveryMapper.insert(delivery);
        }
    }

    private void pushConversationRead(
            Long conversationId,
            Long readerId,
            Long lastReadMessageId,
            LocalDateTime readTime,
            List<Long> readMessageIds) {
        try {
            // 已读回执只推给同会话在线成员，前端据此更新 readCount/readStatus，不依赖轮询。
            List<ImConversationMember> members = conversationMemberMapper.selectList(
                    new LambdaQueryWrapper<ImConversationMember>()
                            .eq(ImConversationMember::getConversationId, conversationId));
            ObjectNode root = objectMapper.createObjectNode();
            root.put("cmd", "MESSAGE_READ");
            ObjectNode data = root.putObject("data");
            data.put("conversationId", conversationId);
            data.put("readerId", readerId);
            if (lastReadMessageId != null) {
                data.put("lastReadMessageId", lastReadMessageId);
            }
            data.put("readTime", readTime != null ? readTime.toString() : null);
            data.putPOJO("readMessageIds", readMessageIds);
            String payload = objectMapper.writeValueAsString(root);
            for (ImConversationMember member : members) {
                if (!member.getUserId().equals(readerId) && sessionManager.isOnline(member.getUserId())) {
                    sessionManager.sendToUser(member.getUserId(), payload);
                }
            }
        } catch (Exception ignored) {
            // Read state is persisted; clients can recover by refreshing message history.
        }
    }

    private void updateConversationPreviewAfterRecall(ImMessage message) {
        ImMessage latestMessage = messageMapper.selectOne(
                new LambdaQueryWrapper<ImMessage>()
                        .eq(ImMessage::getConversationId, message.getConversationId())
                        .orderByDesc(ImMessage::getCreateTime)
                        .orderByDesc(ImMessage::getId)
                        .last("LIMIT 1"));
        if (latestMessage == null || !message.getId().equals(latestMessage.getId())) {
            return;
        }

        ImConversation conversation = conversationMapper.selectById(message.getConversationId());
        if (conversation == null) {
            return;
        }
        conversation.setLastMessage("消息已撤回");
        conversation.setLastMessageTime(message.getCreateTime());
        conversationMapper.updateById(conversation);
    }

    private void pushMessageUpdated(ImMessage message) {
        try {
            // 撤回等状态变更只推送精简 payload，避免 WebSocket 消息承载完整历史查询语义。
            List<ImConversationMember> members = conversationMemberMapper.selectList(
                    new LambdaQueryWrapper<ImConversationMember>()
                            .eq(ImConversationMember::getConversationId, message.getConversationId()));
            ObjectNode root = objectMapper.createObjectNode();
            root.put("cmd", "MESSAGE_UPDATED");
            ObjectNode data = root.putObject("data");
            data.put("messageId", message.getId());
            data.put("conversationId", message.getConversationId());
            data.put("senderId", message.getSenderId());
            SysUser sender = userMapper.selectById(message.getSenderId());
            data.put("senderName", sender != null ? sender.getNickname() : "");
            data.put("senderAvatar", sender != null ? sender.getAvatar() : "");
            data.put("senderSignature", sender != null ? sender.getSignature() : "");
            data.put("messageType", message.getMessageType());
            data.put("content", message.getContent());
            data.put("status", message.getStatus());
            data.put("clientMsgId", message.getClientMsgId());
            data.put("createdAt", message.getCreateTime() != null ? message.getCreateTime().toString() : null);
            String payload = objectMapper.writeValueAsString(root);
            for (ImConversationMember member : members) {
                if (sessionManager.isOnline(member.getUserId())) {
                    sessionManager.sendToUser(member.getUserId(), payload);
                }
            }
        } catch (Exception ignored) {
            // The recall is already persisted; online update failures are recovered by history refresh.
        }
    }

    private MessageVO toMessageVO(ImMessage message, Long viewerId) {
        MessageVO vo = new MessageVO();
        vo.setMessageId(message.getId());
        vo.setConversationId(message.getConversationId());
        vo.setSenderId(message.getSenderId());
        vo.setMessageType(message.getMessageType());
        vo.setContent(message.getContent());
        vo.setStatus(message.getStatus());
        vo.setClientMsgId(message.getClientMsgId());
        vo.setCreateTime(message.getCreateTime());

        SysUser user = userMapper.selectById(message.getSenderId());
        if (user != null) {
            vo.setSenderName(user.getNickname());
            vo.setSenderAvatar(user.getAvatar());
            vo.setSenderSignature(user.getSignature());
        }

        fillReadReceipt(vo, message, viewerId);

        return vo;
    }

    private List<MessageVO> toMessageVOList(List<ImMessage> messages, Long viewerId) {
        if (messages == null || messages.isEmpty()) {
            return List.of();
        }
        List<Long> messageIds = messages.stream().map(ImMessage::getId).filter(Objects::nonNull).toList();
        List<Long> senderIds = messages.stream().map(ImMessage::getSenderId).filter(Objects::nonNull).distinct().toList();
        Map<Long, SysUser> users = senderIds.isEmpty()
                ? Collections.emptyMap()
                : userMapper.selectBatchIds(senderIds).stream()
                        .collect(Collectors.toMap(SysUser::getId, Function.identity()));
        Map<Long, List<ImMessageDelivery>> deliveries = messageIds.isEmpty()
                ? Collections.emptyMap()
                : messageDeliveryMapper.selectList(
                                new LambdaQueryWrapper<ImMessageDelivery>()
                                        .in(ImMessageDelivery::getMessageId, messageIds))
                        .stream()
                        .collect(Collectors.groupingBy(ImMessageDelivery::getMessageId));

        return messages.stream().map(message -> {
            MessageVO vo = new MessageVO();
            vo.setMessageId(message.getId());
            vo.setConversationId(message.getConversationId());
            vo.setSenderId(message.getSenderId());
            vo.setMessageType(message.getMessageType());
            vo.setContent(message.getContent());
            vo.setStatus(message.getStatus());
            vo.setClientMsgId(message.getClientMsgId());
            vo.setCreateTime(message.getCreateTime());

            SysUser sender = users.get(message.getSenderId());
            if (sender != null) {
                vo.setSenderName(sender.getNickname());
                vo.setSenderAvatar(sender.getAvatar());
                vo.setSenderSignature(sender.getSignature());
            }

            List<ImMessageDelivery> messageDeliveries =
                    deliveries.getOrDefault(message.getId(), List.of());
            int recipientCount = (int) messageDeliveries.stream()
                    .filter(delivery -> !message.getSenderId().equals(delivery.getUserId()))
                    .count();
            int readCount = (int) messageDeliveries.stream()
                    .filter(delivery -> !message.getSenderId().equals(delivery.getUserId()))
                    .filter(delivery -> Integer.valueOf(1).equals(delivery.getReadStatus()))
                    .count();
            vo.setRecipientCount(recipientCount);
            vo.setReadCount(readCount);
            if (viewerId != null && viewerId.equals(message.getSenderId())) {
                vo.setReadStatus(recipientCount == 0 || readCount >= recipientCount ? 1 : 0);
            } else if (viewerId != null) {
                messageDeliveries.stream()
                        .filter(delivery -> viewerId.equals(delivery.getUserId()))
                        .findFirst()
                        .ifPresent(delivery -> {
                            vo.setReadStatus(delivery.getReadStatus());
                            vo.setReadTime(delivery.getReadTime());
                        });
            }
            return vo;
        }).toList();
    }

    private void fillReadReceipt(MessageVO vo, ImMessage message, Long viewerId) {
        Long recipientCount = messageDeliveryMapper.selectCount(
                new LambdaQueryWrapper<ImMessageDelivery>()
                        .eq(ImMessageDelivery::getMessageId, message.getId())
                        .ne(ImMessageDelivery::getUserId, message.getSenderId()));
        Long readCount = messageDeliveryMapper.selectCount(
                new LambdaQueryWrapper<ImMessageDelivery>()
                        .eq(ImMessageDelivery::getMessageId, message.getId())
                        .ne(ImMessageDelivery::getUserId, message.getSenderId())
                        .eq(ImMessageDelivery::getReadStatus, 1));

        int recipients = recipientCount != null ? recipientCount.intValue() : 0;
        int readers = readCount != null ? readCount.intValue() : 0;
        vo.setRecipientCount(recipients);
        vo.setReadCount(readers);

        if (viewerId != null && viewerId.equals(message.getSenderId())) {
            vo.setReadStatus(recipients == 0 || readers >= recipients ? 1 : 0);
            return;
        }

        if (viewerId != null) {
            ImMessageDelivery delivery = messageDeliveryMapper.selectOne(
                    new LambdaQueryWrapper<ImMessageDelivery>()
                            .eq(ImMessageDelivery::getMessageId, message.getId())
                            .eq(ImMessageDelivery::getUserId, viewerId));
            if (delivery != null) {
                vo.setReadStatus(delivery.getReadStatus());
                vo.setReadTime(delivery.getReadTime());
            }
        }
    }

    private String getMessagePreview(String messageType, String content) {
        if (!StringUtils.hasText(content)) {
            return "";
        }
        if (MESSAGE_TYPE_SHAKE.equalsIgnoreCase(messageType)) {
            return "[窗口抖动]";
        }

        try {
            JsonNode node = objectMapper.readTree(content);
            switch (messageType) {
                case MESSAGE_TYPE_TEXT:
                    if (node.has("text")) {
                        String text = node.get("text").asText();
                        return text.length() > 50 ? text.substring(0, 50) : text;
                    }
                    break;
                case MESSAGE_TYPE_IMAGE:
                    return "[图片]";
                case MESSAGE_TYPE_FILE:
                    if (node.has("fileName")) {
                        return "[文件] " + node.get("fileName").asText();
                    }
                    return "[文件]";
                case MESSAGE_TYPE_STICKER:
                    if (node.has("name")) {
                        return "[表情] " + node.get("name").asText();
                    }
                    return "[表情]";
                case MESSAGE_TYPE_FOLDER:
                    if (node.has("folderName")) {
                        return "[文件夹] " + node.get("folderName").asText();
                    }
                    return "[文件夹]";
                default:
                    break;
            }
        } catch (Exception ignored) {
        }

        return content.length() > 50 ? content.substring(0, 50) : content;
    }

    private int normalizeLimit(int requested, int fallback, int maximum) {
        if (requested <= 0) {
            return fallback;
        }
        return Math.min(requested, maximum);
    }

    private void validateAllMentionPermission(SendMessageRequest request, ImConversationMember senderMember) {
        // @all is intentionally restricted to owner/admin so large groups cannot be globally interrupted by any member.
        if (!MESSAGE_TYPE_TEXT.equalsIgnoreCase(request.getMessageType()) || !containsAllMention(request.getContent())) {
            return;
        }

        ImConversation conversation = conversationMapper.selectById(request.getConversationId());
        if (conversation == null || conversation.getType() == null || conversation.getType() != 2) {
            throw new BusinessException(403, "@所有人只能在群聊中使用");
        }

        String role = senderMember.getRole();
        if (!"owner".equals(role) && !"admin".equals(role)) {
            throw new BusinessException(403, "只有群主和群管理员可以@所有人");
        }
    }

    private void validateSupportedMessageType(SendMessageRequest request) {
        String messageType = request.getMessageType();
        if (MESSAGE_TYPE_TEXT.equalsIgnoreCase(messageType)
                || MESSAGE_TYPE_IMAGE.equalsIgnoreCase(messageType)
                || MESSAGE_TYPE_FILE.equalsIgnoreCase(messageType)
                || MESSAGE_TYPE_STICKER.equalsIgnoreCase(messageType)
                || MESSAGE_TYPE_SHAKE.equalsIgnoreCase(messageType)
                || MESSAGE_TYPE_FOLDER.equalsIgnoreCase(messageType)) {
            return;
        }
        throw new BusinessException(400, "Unsupported message type");
    }

    private void validateSendRequest(SendMessageRequest request) {
        if (request == null || request.getConversationId() == null) {
            throw new BusinessException(400, "conversationId is required");
        }
        if (!StringUtils.hasText(request.getMessageType())) {
            throw new BusinessException(400, "messageType is required");
        }
        if (!StringUtils.hasText(request.getContent()) || request.getContent().length() > 60000) {
            throw new BusinessException(400, "Message content is empty or too large");
        }
        if (StringUtils.hasText(request.getClientMsgId()) && request.getClientMsgId().length() > 64) {
            throw new BusinessException(400, "clientMsgId is too long");
        }
    }

    private void validateMediaMessage(SendMessageRequest request) {
        boolean isFile = MESSAGE_TYPE_FILE.equalsIgnoreCase(request.getMessageType());
        boolean isImage = MESSAGE_TYPE_IMAGE.equalsIgnoreCase(request.getMessageType());
        if (!isFile && !isImage) {
            if (MESSAGE_TYPE_FOLDER.equalsIgnoreCase(request.getMessageType())) {
                validateFolderMessage(request);
            }
            return;
        }
        String invalidContentMessage = isFile ? "Invalid file message content" : "Invalid image message content";
        try {
            JsonNode root = objectMapper.readTree(request.getContent());
            JsonNode fileIdNode = root.get("fileId");
            if (fileIdNode == null || fileIdNode.asText().isBlank()) {
                throw new BusinessException(400, "fileId is required");
            }
            boolean hasCommonMetadata = root.hasNonNull("fileName") && root.hasNonNull("fileSize");
            if (!hasCommonMetadata || (isFile && !root.hasNonNull("transferMode"))
                    || (isImage && (!root.hasNonNull("url") || !root.hasNonNull("contentType")))) {
                throw new BusinessException(400, invalidContentMessage);
            }
            ImFile file = fileMetadataService.getById(Long.parseLong(fileIdNode.asText()));
            if (file == null || !FileMetadataService.STATUS_AVAILABLE.equals(file.getStatus())) {
                throw new BusinessException(404, "File not found");
            }
            if (file.getConversationId() == null || !file.getConversationId().equals(request.getConversationId())) {
                throw new BusinessException(403, "File does not belong to this conversation");
            }
            if (isImage && !ImageTypeDetector.isSafeInlineType(file.getContentType())) {
                throw new BusinessException(415, "Image message must reference an image file");
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(400, invalidContentMessage);
        }
    }

    private void validateFolderMessage(SendMessageRequest request) {
        String invalidContentMessage = "Invalid folder message content";
        try {
            JsonNode root = objectMapper.readTree(request.getContent());
            JsonNode folderNameNode = root.get("folderName");
            if (folderNameNode == null || folderNameNode.asText().isBlank()) {
                throw new BusinessException(400, invalidContentMessage);
            }
            JsonNode filesNode = root.get("files");
            if (filesNode == null || !filesNode.isArray() || filesNode.isEmpty()) {
                throw new BusinessException(400, invalidContentMessage);
            }
            for (JsonNode fileNode : filesNode) {
                JsonNode fileIdNode = fileNode.get("fileId");
                if (fileIdNode == null || fileIdNode.asText().isBlank()
                        || !fileNode.hasNonNull("fileName") || !fileNode.hasNonNull("fileSize")) {
                    throw new BusinessException(400, invalidContentMessage);
                }
                ImFile file = fileMetadataService.getById(Long.parseLong(fileIdNode.asText()));
                if (file == null || !FileMetadataService.STATUS_AVAILABLE.equals(file.getStatus())) {
                    throw new BusinessException(404, "File not found");
                }
                if (file.getConversationId() == null
                        || !file.getConversationId().equals(request.getConversationId())) {
                    throw new BusinessException(403, "File does not belong to this conversation");
                }
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(400, invalidContentMessage);
        }
    }

    private boolean containsAllMention(String content) {
        if (!StringUtils.hasText(content)) {
            return false;
        }
        try {
            JsonNode root = objectMapper.readTree(content);
            JsonNode mentions = root.get("mentions");
            if (mentions == null || !mentions.isArray()) {
                return false;
            }
            for (JsonNode mention : mentions) {
                if (isAllMention(mention)) {
                    return true;
                }
            }
        } catch (Exception ignored) {
            return false;
        }
        return false;
    }

    private boolean isAllMention(JsonNode mention) {
        JsonNode type = mention.get("type");
        if (type != null && MENTION_TYPE_ALL.equals(type.asText())) {
            return true;
        }
        JsonNode userId = mention.get("userId");
        return userId != null && MENTION_ALL_USER_ID.equals(userId.asText());
    }

}
