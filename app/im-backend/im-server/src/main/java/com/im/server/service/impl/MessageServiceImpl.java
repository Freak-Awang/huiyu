package com.im.server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class MessageServiceImpl implements MessageService {

    @Autowired
    private MessageMapper messageMapper;

    @Autowired
    private ConversationMapper conversationMapper;

    @Autowired
    private ConversationMemberMapper conversationMemberMapper;

    @Autowired
    private UserMapper userMapper;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public PageResult<MessageVO> getMessages(Long conversationId, Long beforeMessageId, int pageSize) {
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
            dupWrapper.eq(ImMessage::getClientMsgId, request.getClientMsgId());
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
                default:
                    break;
            }
        } catch (Exception ignored) {
        }

        return content.length() > 50 ? content.substring(0, 50) : content;
    }
}
