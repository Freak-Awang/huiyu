package com.im.server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.im.common.dto.ConversationVO;
import com.im.common.dto.CreateConversationRequest;
import com.im.common.dto.MemberVO;
import com.im.common.dto.UpdateConversationSettingsRequest;
import com.im.common.dto.UpdateMemberRoleRequest;
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
    private static final String MENTION_TYPE_ALL = "all";
    private static final String MENTION_ALL_USER_ID = "__ALL__";
    private static final String ROLE_OWNER = "owner";
    private static final String ROLE_ADMIN = "admin";
    private static final String ROLE_MEMBER = "member";

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
                            .ne(ImMessage::getSenderId, userId)
                            .ne(ImMessage::getStatus, "RECALLED")
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
            member1.setIsMuted(0);
            conversationMemberMapper.insert(member1);

            ImConversationMember member2 = new ImConversationMember();
            member2.setConversationId(conversation.getId());
            member2.setUserId(request.getTargetUserId());
            member2.setRole("member");
            member2.setJoinTime(LocalDateTime.now());
            member2.setIsPinned(0);
            member2.setIsMuted(0);
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
            ownerMember.setIsMuted(0);
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
                member.setIsMuted(0);
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
            throw new BusinessException("Conversation not found");
        }
        if (conversation.getType() == null || conversation.getType() != 2) {
            throw new BusinessException("Only group conversations can add members");
        }
        if (userIds == null || userIds.isEmpty()) {
            throw new BusinessException("User ids are required");
        }

        ImConversationMember operatorMember = getMemberOrThrow(conversationId, operatorId, "Operator is not a member of this conversation");
        requireOwnerOrAdmin(operatorMember, "Only the owner or admin can add members");

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
            member.setIsMuted(0);
            conversationMemberMapper.insert(member);
        }
        notifyConversationUpdated(conversationId);
    }

    @Override
    @Transactional
    public void removeMember(Long conversationId, Long userId, Long operatorId) {
        ImConversation conversation = conversationMapper.selectById(conversationId);
        if (conversation == null) {
            throw new BusinessException("Conversation not found");
        }

        ImConversationMember operatorMember = getMemberOrThrow(conversationId, operatorId, "Operator is not a member of this conversation");
        ImConversationMember targetMember = getMemberOrThrow(conversationId, userId, "User is not a member of this conversation");

        boolean isOwner = ROLE_OWNER.equals(operatorMember.getRole());
        boolean isAdmin = ROLE_ADMIN.equals(operatorMember.getRole());
        boolean isSelf = userId.equals(operatorId);

        if (ROLE_OWNER.equals(targetMember.getRole())) {
            throw new BusinessException(403, "The group owner cannot be removed");
        }
        if (!isSelf && !isOwner && !(isAdmin && ROLE_MEMBER.equals(targetMember.getRole()))) {
            throw new BusinessException(403, "No permission to remove this member");
        }

        conversationMemberMapper.deleteById(targetMember.getId());

        if (conversation.getType() != null && conversation.getType() == 2) {
            Long remainingCount = conversationMemberMapper.selectCount(
                    new LambdaQueryWrapper<ImConversationMember>()
                            .eq(ImConversationMember::getConversationId, conversationId));
            if (remainingCount == null || remainingCount == 0) {
                conversationMapper.deleteById(conversationId);
            } else {
                notifyConversationUpdated(conversationId);
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
            throw new BusinessException("User is not a member of this conversation");
        }

        member.setIsPinned(pinned ? 1 : 0);
        conversationMemberMapper.updateById(member);
    }

    @Override
    public void muteConversation(Long conversationId, Long userId, boolean muted) {
        ImConversationMember member = conversationMemberMapper.selectOne(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversationId)
                        .eq(ImConversationMember::getUserId, userId));
        if (member == null) {
            throw new BusinessException("User is not a member of this conversation");
        }

        member.setIsMuted(muted ? 1 : 0);
        conversationMemberMapper.updateById(member);
    }

    @Override
    @Transactional
    public ConversationVO updateSettings(Long conversationId, Long operatorId, UpdateConversationSettingsRequest request) {
        ImConversation conversation = getGroupConversationOrThrow(conversationId);
        ImConversationMember operatorMember = getMemberOrThrow(conversationId, operatorId, "Operator is not a member of this conversation");
        requireOwnerOrAdmin(operatorMember, "Only the owner or admin can update group settings");

        boolean changed = false;
        if (request != null && request.getName() != null) {
            String name = request.getName().trim();
            if (!StringUtils.hasText(name)) {
                throw new BusinessException(400, "Group name cannot be empty");
            }
            conversation.setName(name);
            changed = true;
        }
        if (request != null && request.getAnnouncement() != null) {
            conversation.setAnnouncement(request.getAnnouncement().trim());
            conversation.setAnnouncementUpdatedBy(operatorId);
            conversation.setAnnouncementUpdatedAt(LocalDateTime.now());
            changed = true;
        }
        if (changed) {
            conversation.setUpdateTime(LocalDateTime.now());
            conversationMapper.updateById(conversation);
            notifyConversationUpdated(conversationId);
        }
        return buildConversationVO(conversationMapper.selectById(conversationId), operatorId);
    }

    @Override
    @Transactional
    public ConversationVO updateMemberRole(Long conversationId, Long targetUserId, Long operatorId, UpdateMemberRoleRequest request) {
        getGroupConversationOrThrow(conversationId);
        ImConversationMember operatorMember = getMemberOrThrow(conversationId, operatorId, "Operator is not a member of this conversation");
        if (!ROLE_OWNER.equals(operatorMember.getRole())) {
            throw new BusinessException(403, "Only the group owner can update member roles");
        }
        if (targetUserId.equals(operatorId)) {
            throw new BusinessException(400, "The group owner role cannot be changed");
        }
        ImConversationMember targetMember = getMemberOrThrow(conversationId, targetUserId, "User is not a member of this conversation");
        if (ROLE_OWNER.equals(targetMember.getRole())) {
            throw new BusinessException(400, "The group owner role cannot be changed");
        }
        String role = request != null ? request.getRole() : null;
        if (!ROLE_ADMIN.equals(role) && !ROLE_MEMBER.equals(role)) {
            throw new BusinessException(400, "Role must be admin or member");
        }
        targetMember.setRole(role);
        conversationMemberMapper.updateById(targetMember);
        notifyConversationUpdated(conversationId);
        return buildConversationVO(conversationMapper.selectById(conversationId), operatorId);
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

    private void notifyConversationUpdated(Long conversationId) {
        ImConversation conversation = conversationMapper.selectById(conversationId);
        if (conversation == null) {
            return;
        }
        List<ImConversationMember> members = conversationMemberMapper.selectList(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversationId));
        for (ImConversationMember member : members) {
            if (!sessionManager.isOnline(member.getUserId())) {
                continue;
            }
            try {
                ObjectNode message = objectMapper.createObjectNode();
                message.put("cmd", "CONVERSATION_UPDATED");
                message.set("data", objectMapper.valueToTree(buildConversationVO(conversation, member.getUserId())));
                sessionManager.sendToUser(member.getUserId(), objectMapper.writeValueAsString(message));
            } catch (Exception e) {
                log.error("Failed to push conversation updated event: conversationId={}, userId={}",
                        conversationId, member.getUserId(), e);
            }
        }
    }

    private ConversationVO buildConversationVO(ImConversation conversation, Long userId) {
        ConversationVO vo = new ConversationVO();
        vo.setConversationId(conversation.getId());
        vo.setType(conversation.getType());
        vo.setName(conversation.getName());
        vo.setAvatar(conversation.getAvatar());
        vo.setAnnouncement(conversation.getAnnouncement());
        vo.setAnnouncementUpdatedBy(conversation.getAnnouncementUpdatedBy());
        vo.setAnnouncementUpdatedAt(conversation.getAnnouncementUpdatedAt());
        vo.setLastMessage(conversation.getLastMessage());
        vo.setLastMessageTime(conversation.getLastMessageTime());
        vo.setUnreadCount(0);
        vo.setMentionUnreadCount(0);

        ImConversationMember selfMember = conversationMemberMapper.selectOne(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversation.getId())
                        .eq(ImConversationMember::getUserId, userId));
        vo.setIsPinned(selfMember != null ? selfMember.getIsPinned() : 0);
        vo.setIsMuted(selfMember != null && selfMember.getIsMuted() != null ? selfMember.getIsMuted() : 0);
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
            memberVO.setSignature(user != null ? user.getSignature() : null);
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
                .eq(ImMessage::getMessageType, "TEXT")
                .ne(ImMessage::getSenderId, userId)
                .ne(ImMessage::getStatus, "RECALLED");
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
                if (isAllMention(mention)) {
                    return true;
                }
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

    private boolean isAllMention(JsonNode mention) {
        JsonNode type = mention.get("type");
        if (type != null && MENTION_TYPE_ALL.equals(type.asText())) {
            return true;
        }
        JsonNode userId = mention.get("userId");
        return userId != null && MENTION_ALL_USER_ID.equals(userId.asText());
    }

    private ImConversation getGroupConversationOrThrow(Long conversationId) {
        ImConversation conversation = conversationMapper.selectById(conversationId);
        if (conversation == null) {
            throw new BusinessException("Conversation not found");
        }
        if (conversation.getType() == null || conversation.getType() != 2) {
            throw new BusinessException(400, "Only group conversations can be managed");
        }
        return conversation;
    }

    private ImConversationMember getMemberOrThrow(Long conversationId, Long userId, String message) {
        ImConversationMember member = conversationMemberMapper.selectOne(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversationId)
                        .eq(ImConversationMember::getUserId, userId));
        if (member == null) {
            throw new BusinessException(message);
        }
        return member;
    }

    private void requireOwnerOrAdmin(ImConversationMember member, String message) {
        if (!ROLE_OWNER.equals(member.getRole()) && !ROLE_ADMIN.equals(member.getRole())) {
            throw new BusinessException(403, message);
        }
    }
}
