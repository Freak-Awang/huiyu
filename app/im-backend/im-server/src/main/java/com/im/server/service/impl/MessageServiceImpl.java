package com.im.server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.im.common.dto.MessageVO;
import com.im.common.dto.SendMessageRequest;
import com.im.common.entity.ImConversation;
import com.im.common.entity.ImConversationMember;
import com.im.common.entity.ImMessage;
import com.im.common.entity.SysUser;
import com.im.common.exception.BusinessException;
import com.im.common.result.PageResult;
import com.im.server.mapper.ConversationMapper;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.MessageMapper;
import com.im.server.mapper.UserMapper;
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

    @Autowired
    private MessageMapper messageMapper;

    @Autowired
    private ConversationMapper conversationMapper;

    @Autowired
    private ConversationMemberMapper conversationMemberMapper;

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private WebSocketSessionManager sessionManager;

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
                new LambdaQueryWrapper<ImMessage>().eq(ImMessage::getConversationId, conversationId));

        LambdaQueryWrapper<ImMessage> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ImMessage::getConversationId, conversationId);
        if (beforeMessageId != null) {
            wrapper.lt(ImMessage::getId, beforeMessageId);
        }
        wrapper.orderByDesc(ImMessage::getCreateTime);
        wrapper.last("LIMIT " + pageSize);

        List<ImMessage> messages = messageMapper.selectList(wrapper);
        List<MessageVO> voList = messages.stream()
                .map(this::toMessageVO)
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
                .map(this::toMessageVO)
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

        messageMapper.insert(message);

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
        pushMessageUpdated(message);
        return toMessageVO(message);
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

    private MessageVO toMessageVO(ImMessage message) {
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
        }

        return vo;
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
}
