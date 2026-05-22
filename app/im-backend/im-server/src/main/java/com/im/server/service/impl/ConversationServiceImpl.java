package com.im.server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.im.common.dto.ConversationVO;
import com.im.common.dto.CreateConversationRequest;
import com.im.common.dto.MemberVO;
import com.im.common.entity.ImConversation;
import com.im.common.entity.ImConversationMember;
import com.im.common.entity.ImMessage;
import com.im.common.entity.SysUser;
import com.im.common.exception.BusinessException;
import com.im.server.mapper.ConversationMapper;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.MessageMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.service.ConversationService;
import com.im.server.websocket.WebSocketSessionManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ConversationServiceImpl implements ConversationService {

    private static final Logger log = LoggerFactory.getLogger(ConversationServiceImpl.class);

    @Autowired
    private ConversationMapper conversationMapper;

    @Autowired
    private ConversationMemberMapper conversationMemberMapper;

    @Autowired
    private MessageMapper messageMapper;

    @Autowired
    private UserMapper userMapper;

    @Autowired
    private WebSocketSessionManager sessionManager;

    @Autowired
    private ObjectMapper objectMapper;

    @Override
    public List<ConversationVO> listConversations(Long userId) {
        List<ImConversationMember> memberRecords = conversationMemberMapper.selectList(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getUserId, userId)
                        .orderByDesc(ImConversationMember::getIsPinned)
                        .orderByDesc(ImConversationMember::getLastReadTime));

        List<ConversationVO> result = new ArrayList<>();
        for (ImConversationMember member : memberRecords) {
            ImConversation conversation = conversationMapper.selectById(member.getConversationId());
            if (conversation == null) {
                continue;
            }

            ConversationVO vo = buildConversationVO(conversation, userId);

            LocalDateTime since = member.getLastReadTime() != null
                    ? member.getLastReadTime()
                    : member.getJoinTime();

            Long unreadCount = messageMapper.selectCount(
                    new LambdaQueryWrapper<ImMessage>()
                            .eq(ImMessage::getConversationId, conversation.getId())
                            .gt(since != null, ImMessage::getCreateTime, since));
            vo.setUnreadCount(unreadCount != null ? unreadCount.intValue() : 0);

            result.add(vo);
        }

        result.sort(Comparator
                .comparing(ConversationVO::getIsPinned, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(ConversationVO::getLastMessageTime, Comparator.nullsLast(Comparator.reverseOrder())));

        return result;
    }

    @Override
    @Transactional
    public ConversationVO createConversation(Long userId, CreateConversationRequest request) {
        if (request == null) {
            throw new BusinessException("Conversation request is required");
        }
        if (request.getType() == null) {
            throw new BusinessException("Conversation type is required");
        }

        if (request.getType() == 1) {
            if (request.getTargetUserId() == null) {
                throw new BusinessException("Target user is required");
            }
            if (request.getTargetUserId().equals(userId)) {
                throw new BusinessException("Cannot create a single chat with yourself");
            }
            SysUser targetUser = userMapper.selectById(request.getTargetUserId());
            if (targetUser == null) {
                throw new BusinessException("Target user does not exist");
            }

            ImConversation existing = findExistingSingleChat(userId, request.getTargetUserId());
            if (existing != null) {
                return buildConversationVO(existing, userId);
            }

            ImConversation conversation = new ImConversation();
            conversation.setType(1);
            conversation.setCreateTime(LocalDateTime.now());
            conversation.setUpdateTime(LocalDateTime.now());
            conversationMapper.insert(conversation);

            ImConversationMember member1 = new ImConversationMember();
            member1.setConversationId(conversation.getId());
            member1.setUserId(userId);
            member1.setRole("member");
            member1.setJoinTime(LocalDateTime.now());
            member1.setIsPinned(0);
            conversationMemberMapper.insert(member1);

            ImConversationMember member2 = new ImConversationMember();
            member2.setConversationId(conversation.getId());
            member2.setUserId(request.getTargetUserId());
            member2.setRole("member");
            member2.setJoinTime(LocalDateTime.now());
            member2.setIsPinned(0);
            conversationMemberMapper.insert(member2);

            return buildConversationVO(conversation, userId);
        }

        if (request.getType() == 2) {
            if (!StringUtils.hasText(request.getName())) {
                throw new BusinessException("Group name is required");
            }
            Set<Long> memberIds = new LinkedHashSet<>();
            if (request.getMemberIds() != null) {
                for (Long memberId : request.getMemberIds()) {
                    if (memberId != null && !memberId.equals(userId)) {
                        memberIds.add(memberId);
                    }
                }
            }
            if (memberIds.isEmpty()) {
                throw new BusinessException("Group members are required");
            }

            ImConversation conversation = new ImConversation();
            conversation.setType(2);
            conversation.setName(request.getName());
            conversation.setOwnerId(userId);
            conversation.setCreateTime(LocalDateTime.now());
            conversation.setUpdateTime(LocalDateTime.now());
            conversationMapper.insert(conversation);

            ImConversationMember ownerMember = new ImConversationMember();
            ownerMember.setConversationId(conversation.getId());
            ownerMember.setUserId(userId);
            ownerMember.setRole("owner");
            ownerMember.setJoinTime(LocalDateTime.now());
            ownerMember.setIsPinned(0);
            conversationMemberMapper.insert(ownerMember);

            for (Long memberId : memberIds) {
                SysUser user = userMapper.selectById(memberId);
                if (user == null) {
                    throw new BusinessException("User does not exist: " + memberId);
                }
                ImConversationMember member = new ImConversationMember();
                member.setConversationId(conversation.getId());
                member.setUserId(memberId);
                member.setRole("member");
                member.setJoinTime(LocalDateTime.now());
                member.setIsPinned(0);
                conversationMemberMapper.insert(member);
            }

            notifyConversationCreated(conversation, memberIds);

            return buildConversationVO(conversation, userId);
        }

        throw new BusinessException("Invalid conversation type: " + request.getType());
    }

    @Override
    @Transactional
    public void addMembers(Long conversationId, List<Long> userIds, Long operatorId) {
        ImConversation conversation = conversationMapper.selectById(conversationId);
        if (conversation == null) {
            throw new RuntimeException("Conversation not found");
        }

        ImConversationMember operatorMember = conversationMemberMapper.selectOne(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversationId)
                        .eq(ImConversationMember::getUserId, operatorId));
        if (operatorMember == null) {
            throw new RuntimeException("Operator is not a member of this conversation");
        }

        if (!"owner".equals(operatorMember.getRole()) && !"admin".equals(operatorMember.getRole())) {
            throw new RuntimeException("Only the owner or admin can add members");
        }

        for (Long userId : userIds) {
            ImConversationMember existing = conversationMemberMapper.selectOne(
                    new LambdaQueryWrapper<ImConversationMember>()
                            .eq(ImConversationMember::getConversationId, conversationId)
                            .eq(ImConversationMember::getUserId, userId));
            if (existing != null) {
                continue;
            }

            ImConversationMember member = new ImConversationMember();
            member.setConversationId(conversationId);
            member.setUserId(userId);
            member.setRole("member");
            member.setJoinTime(LocalDateTime.now());
            member.setIsPinned(0);
            conversationMemberMapper.insert(member);
        }
    }

    @Override
    @Transactional
    public void removeMember(Long conversationId, Long userId, Long operatorId) {
        ImConversation conversation = conversationMapper.selectById(conversationId);
        if (conversation == null) {
            throw new RuntimeException("Conversation not found");
        }

        ImConversationMember operatorMember = conversationMemberMapper.selectOne(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversationId)
                        .eq(ImConversationMember::getUserId, operatorId));
        if (operatorMember == null) {
            throw new RuntimeException("Operator is not a member of this conversation");
        }

        ImConversationMember targetMember = conversationMemberMapper.selectOne(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversationId)
                        .eq(ImConversationMember::getUserId, userId));
        if (targetMember == null) {
            throw new RuntimeException("User is not a member of this conversation");
        }

        boolean isOwner = "owner".equals(operatorMember.getRole());
        boolean isSelf = userId.equals(operatorId);

        if (!isOwner && !isSelf) {
            throw new RuntimeException("Only the conversation owner can remove other members");
        }

        conversationMemberMapper.deleteById(targetMember.getId());

        if (conversation.getType() != null && conversation.getType() == 2) {
            Long remainingCount = conversationMemberMapper.selectCount(
                    new LambdaQueryWrapper<ImConversationMember>()
                            .eq(ImConversationMember::getConversationId, conversationId));
            if (remainingCount == null || remainingCount == 0) {
                conversationMapper.deleteById(conversationId);
            }
        }
    }

    @Override
    public void pinConversation(Long conversationId, Long userId, boolean pinned) {
        ImConversationMember member = conversationMemberMapper.selectOne(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversationId)
                        .eq(ImConversationMember::getUserId, userId));
        if (member == null) {
            throw new RuntimeException("User is not a member of this conversation");
        }

        member.setIsPinned(pinned ? 1 : 0);
        conversationMemberMapper.updateById(member);
    }

    @Override
    public ConversationVO getById(Long id, Long userId) {
        ImConversationMember member = conversationMemberMapper.selectOne(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, id)
                        .eq(ImConversationMember::getUserId, userId));
        if (member == null) {
            throw new BusinessException("User is not a member of this conversation");
        }

        ImConversation conversation = conversationMapper.selectById(id);
        if (conversation == null) {
            throw new BusinessException("Conversation not found");
        }
        return buildConversationVO(conversation, userId);
    }

    private ImConversation findExistingSingleChat(Long userId1, Long userId2) {
        List<ImConversationMember> user1Members = conversationMemberMapper.selectList(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getUserId, userId1));
        if (user1Members.isEmpty()) {
            return null;
        }

        List<Long> convIds = user1Members.stream()
                .map(ImConversationMember::getConversationId)
                .collect(Collectors.toList());

        List<ImConversationMember> commonMembers = conversationMemberMapper.selectList(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getUserId, userId2)
                        .in(ImConversationMember::getConversationId, convIds));

        for (ImConversationMember member : commonMembers) {
            ImConversation conv = conversationMapper.selectById(member.getConversationId());
            if (conv != null && conv.getType() != null && conv.getType() == 1) {
                return conv;
            }
        }
        return null;
    }

    private void notifyConversationCreated(ImConversation conversation, Set<Long> memberIds) {
        for (Long memberId : memberIds) {
            if (!sessionManager.isOnline(memberId)) {
                continue;
            }
            try {
                ObjectNode message = objectMapper.createObjectNode();
                message.put("cmd", "CONVERSATION_CREATED");
                message.set("data", objectMapper.valueToTree(buildConversationVO(conversation, memberId)));
                sessionManager.sendToUser(memberId, objectMapper.writeValueAsString(message));
            } catch (Exception e) {
                log.error("Failed to push conversation created event: conversationId={}, userId={}",
                        conversation.getId(), memberId, e);
            }
        }
    }

    private ConversationVO buildConversationVO(ImConversation conversation, Long userId) {
        ConversationVO vo = new ConversationVO();
        vo.setConversationId(conversation.getId());
        vo.setType(conversation.getType());
        vo.setName(conversation.getName());
        vo.setAvatar(conversation.getAvatar());
        vo.setLastMessage(conversation.getLastMessage());
        vo.setLastMessageTime(conversation.getLastMessageTime());
        vo.setUnreadCount(0);
        vo.setMentionUnreadCount(0);

        ImConversationMember selfMember = conversationMemberMapper.selectOne(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversation.getId())
                        .eq(ImConversationMember::getUserId, userId));
        vo.setIsPinned(selfMember != null ? selfMember.getIsPinned() : 0);
        if (selfMember != null && conversation.getType() != null && conversation.getType() == 2) {
            LocalDateTime since = selfMember.getLastReadTime() != null
                    ? selfMember.getLastReadTime()
                    : selfMember.getJoinTime();
            vo.setMentionUnreadCount(countMentionUnread(conversation.getId(), userId, since));
        }

        List<ImConversationMember> allMembers = conversationMemberMapper.selectList(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversation.getId()));
        vo.setMemberCount(allMembers.size());

        List<MemberVO> memberVOs = new ArrayList<>();
        for (ImConversationMember cm : allMembers) {
            SysUser user = userMapper.selectById(cm.getUserId());
            MemberVO memberVO = new MemberVO();
            memberVO.setUserId(cm.getUserId());
            memberVO.setNickname(user != null ? user.getNickname() : null);
            memberVO.setAvatar(user != null ? user.getAvatar() : null);
            memberVO.setRole(cm.getRole());
            memberVOs.add(memberVO);

            if (conversation.getType() != null && conversation.getType() == 1 && !cm.getUserId().equals(userId)) {
                vo.setName(user != null && StringUtils.hasText(user.getNickname()) ? user.getNickname() : user != null ? user.getUsername() : null);
                vo.setAvatar(user != null ? user.getAvatar() : null);
            }
        }
        vo.setMembers(memberVOs);

        return vo;
    }

    private int countMentionUnread(Long conversationId, Long userId, LocalDateTime since) {
        LambdaQueryWrapper<ImMessage> wrapper = new LambdaQueryWrapper<ImMessage>()
                .eq(ImMessage::getConversationId, conversationId)
                .eq(ImMessage::getMessageType, "TEXT");
        if (since != null) {
            wrapper.gt(ImMessage::getCreateTime, since);
        }
        List<ImMessage> unreadTextMessages = messageMapper.selectList(wrapper);
        int count = 0;
        for (ImMessage message : unreadTextMessages) {
            if (mentionsUser(message.getContent(), userId)) {
                count++;
            }
        }
        return count;
    }

    private boolean mentionsUser(String content, Long userId) {
        if (!StringUtils.hasText(content) || userId == null) {
            return false;
        }
        try {
            JsonNode root = objectMapper.readTree(content);
            JsonNode mentions = root.get("mentions");
            if (mentions == null || !mentions.isArray()) {
                return false;
            }
            for (JsonNode mention : mentions) {
                JsonNode mentionedUserId = mention.get("userId");
                if (mentionedUserId != null && String.valueOf(userId).equals(mentionedUserId.asText())) {
                    return true;
                }
            }
        } catch (Exception ignored) {
            return false;
        }
        return false;
    }
}
