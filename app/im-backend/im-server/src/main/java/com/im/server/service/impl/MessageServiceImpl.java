package com.im.server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.im.common.dto.MessageVO;
import com.im.common.dto.SendMessageRequest;
import com.im.common.entity.ImConversation;
import com.im.common.entity.ImConversationMember;
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
import com.im.server.service.FileService;
import com.im.server.service.MessageService;
import com.im.server.websocket.WebSocketSessionManager;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class MessageServiceImpl implements MessageService {

    private static final int RECALL_LIMIT_MINUTES = 2;
    private static final String MESSAGE_TYPE_TEXT = "TEXT";
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
    private FileService fileService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public PageResult<MessageVO> getMessages(Long userId, Long conversationId, Long beforeMessageId, int pageSize) {
        ImConversationMember member = conversationMemberMapper.selectOne(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversationId)
                        .eq(ImConversationMember::getUserId, userId));
        if (member == null) {
            throw new BusinessException("Not a member of this conversation");
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
        List<MessageVO> voList = messages.stream()
                .map(message -> toMessageVO(message, userId))
                .collect(Collectors.toList());

        return PageResult.success(voList, total, 1, pageSize);
    }

    @Override
    public PageResult<MessageVO> searchMessages(Long userId, Long conversationId, String keyword, int pageSize) {
        ImConversationMember member = conversationMemberMapper.selectOne(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversationId)
                        .eq(ImConversationMember::getUserId, userId));
        if (member == null) {
            throw new BusinessException("Not a member of this conversation");
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

        List<MessageVO> voList = messageMapper.selectList(wrapper).stream()
                .map(message -> toMessageVO(message, userId))
                .collect(Collectors.toList());
        return PageResult.success(voList, voList.size(), 1, pageSize);
    }

    @Override
    @Transactional
    public ImMessage sendMessage(Long senderId, SendMessageRequest request) {
        LambdaQueryWrapper<ImConversationMember> memberWrapper = new LambdaQueryWrapper<>();
        memberWrapper.eq(ImConversationMember::getConversationId, request.getConversationId())
                .eq(ImConversationMember::getUserId, senderId);
        ImConversationMember member = conversationMemberMapper.selectOne(memberWrapper);
        if (member == null) {
            throw new BusinessException("Not a member of this conversation");
        }
        validateAllMentionPermission(request, member);
        validateFileMessage(senderId, request);

        if (StringUtils.hasText(request.getClientMsgId())) {
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

        messageMapper.insert(message);
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
        ImMessage message = messageMapper.selectById(messageId);
        if (message == null) {
            throw new BusinessException("Message not found");
        }
        if (!userId.equals(message.getSenderId())) {
            throw new BusinessException(403, "Only the sender can recall this message");
        }
        if (message.getCreateTime() != null
                && message.getCreateTime().isBefore(LocalDateTime.now().minusMinutes(RECALL_LIMIT_MINUTES))) {
            throw new BusinessException("Messages can only be recalled within 2 minutes");
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
        List<ImMessageDelivery> pendingDeliveries = messageDeliveryMapper.selectList(
                new LambdaQueryWrapper<ImMessageDelivery>()
                        .eq(ImMessageDelivery::getUserId, userId)
                        .eq(ImMessageDelivery::getDelivered, 0)
                        .orderByAsc(ImMessageDelivery::getCreateTime)
                        .last("LIMIT " + Math.max(1, Math.min(limit, 200))));

        return pendingDeliveries.stream()
                .map(delivery -> messageMapper.selectById(delivery.getMessageId()))
                .filter(message -> message != null)
                .map(message -> toMessageVO(message, userId))
                .collect(Collectors.toList());
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

    @Override
    @Transactional
    public void markConversationRead(Long userId, Long conversationId, Long lastReadMessageId) {
        ImConversationMember member = conversationMemberMapper.selectOne(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversationId)
                        .eq(ImConversationMember::getUserId, userId));
        if (member == null) {
            throw new BusinessException("Not a member of this conversation");
        }

        LocalDateTime readBoundary = LocalDateTime.now();
        Long effectiveLastReadMessageId = lastReadMessageId;
        if (lastReadMessageId != null) {
            ImMessage boundaryMessage = messageMapper.selectById(lastReadMessageId);
            if (boundaryMessage == null || !conversationId.equals(boundaryMessage.getConversationId())) {
                throw new BusinessException("Invalid last read message");
            }
            readBoundary = boundaryMessage.getCreateTime() != null ? boundaryMessage.getCreateTime() : readBoundary;
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

        List<Long> candidateMessageIds = messageMapper.selectList(
                        new LambdaQueryWrapper<ImMessage>()
                                .select(ImMessage::getId)
                                .eq(ImMessage::getConversationId, conversationId)
                                .le(ImMessage::getCreateTime, readBoundary))
                .stream()
                .map(ImMessage::getId)
                .collect(Collectors.toList());

        List<Long> newlyReadMessageIds = List.of();
        if (!candidateMessageIds.isEmpty()) {
            newlyReadMessageIds = messageDeliveryMapper.selectList(
                            new LambdaQueryWrapper<ImMessageDelivery>()
                                    .select(ImMessageDelivery::getMessageId)
                                    .eq(ImMessageDelivery::getConversationId, conversationId)
                                    .eq(ImMessageDelivery::getUserId, userId)
                                    .eq(ImMessageDelivery::getReadStatus, 0)
                                    .in(ImMessageDelivery::getMessageId, candidateMessageIds))
                    .stream()
                    .map(ImMessageDelivery::getMessageId)
                    .collect(Collectors.toList());
        }

        if (!newlyReadMessageIds.isEmpty()) {
            LambdaUpdateWrapper<ImMessageDelivery> deliveryWrapper = new LambdaUpdateWrapper<>();
            deliveryWrapper.eq(ImMessageDelivery::getConversationId, conversationId)
                    .eq(ImMessageDelivery::getUserId, userId)
                    .eq(ImMessageDelivery::getReadStatus, 0)
                    .in(ImMessageDelivery::getMessageId, newlyReadMessageIds)
                    .set(ImMessageDelivery::getReadStatus, 1)
                    .set(ImMessageDelivery::getReadTime, readBoundary);
            messageDeliveryMapper.update(null, deliveryWrapper);
        }

        if (member.getLastReadTime() == null || member.getLastReadTime().isBefore(readBoundary)) {
            member.setLastReadTime(readBoundary);
            conversationMemberMapper.updateById(member);
        }

        if (!newlyReadMessageIds.isEmpty()) {
            pushConversationRead(conversationId, userId, effectiveLastReadMessageId, readBoundary, newlyReadMessageIds);
        }
    }

    @Override
    @Transactional
    public void cleanupExpiredMessages() {
        // Chat messages are retained permanently. This method remains for API compatibility
        // with older cleanup scheduling code and intentionally performs no deletion.
    }

    private void createDeliveryRows(ImMessage message) {
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
            ArrayNode receipts = data.putArray("receipts");
            for (Long messageId : readMessageIds) {
                ImMessage message = messageMapper.selectById(messageId);
                if (message == null) {
                    continue;
                }
                MessageVO receipt = toMessageVO(message, message.getSenderId());
                ObjectNode item = receipts.addObject();
                item.put("messageId", receipt.getMessageId());
                item.put("readCount", receipt.getReadCount() != null ? receipt.getReadCount() : 0);
                item.put("recipientCount", receipt.getRecipientCount() != null ? receipt.getRecipientCount() : 0);
                item.put("readStatus", receipt.getReadStatus() != null ? receipt.getReadStatus() : 0);
                item.put("readTime", readTime != null ? readTime.toString() : null);
            }
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

        try {
            JsonNode node = objectMapper.readTree(content);
            switch (messageType) {
                case "TEXT":
                    if (node.has("text")) {
                        String text = node.get("text").asText();
                        return text.length() > 50 ? text.substring(0, 50) : text;
                    }
                    break;
                case "IMAGE":
                    return "[图片]";
                case "FILE":
                    if (node.has("name")) {
                        return "[文件] " + node.get("name").asText();
                    }
                    return "[文件]";
                case "STICKER":
                    if (node.has("name")) {
                        return "[表情] " + node.get("name").asText();
                    }
                    return "[表情]";
                default:
                    break;
            }
        } catch (Exception ignored) {
        }

        return content.length() > 50 ? content.substring(0, 50) : content;
    }

    private void validateAllMentionPermission(SendMessageRequest request, ImConversationMember senderMember) {
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

    private void validateFileMessage(Long senderId, SendMessageRequest request) {
        if ("FILE".equalsIgnoreCase(request.getMessageType())) {
            fileService.validateFileMessage(senderId, request.getConversationId(), request.getContent());
        }
    }
}
