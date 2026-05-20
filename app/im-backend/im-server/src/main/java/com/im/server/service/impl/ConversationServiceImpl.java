package com.im.server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.im.common.dto.ConversationVO;
import com.im.common.dto.CreateConversationRequest;
import com.im.common.dto.MemberVO;
import com.im.common.entity.ImConversation;
import com.im.common.entity.ImConversationMember;
import com.im.common.entity.ImMessage;
import com.im.common.entity.SysUser;
import com.im.server.mapper.ConversationMapper;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.MessageMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.service.ConversationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class ConversationServiceImpl implements ConversationService {

    @Autowired
    private ConversationMapper conversationMapper;

    @Autowired
    private ConversationMemberMapper conversationMemberMapper;

    @Autowired
    private MessageMapper messageMapper;

    @Autowired
    private UserMapper userMapper;

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

            ConversationVO vo = new ConversationVO();
            vo.setConversationId(conversation.getId());
            vo.setType(conversation.getType());
            vo.setName(conversation.getName());
            vo.setAvatar(conversation.getAvatar());
            vo.setLastMessage(conversation.getLastMessage());
            vo.setLastMessageTime(conversation.getLastMessageTime());
            vo.setIsPinned(member.getIsPinned());

            LocalDateTime since = member.getLastReadTime() != null
                    ? member.getLastReadTime()
                    : member.getJoinTime();

            Long unreadCount = messageMapper.selectCount(
                    new LambdaQueryWrapper<ImMessage>()
                            .eq(ImMessage::getConversationId, conversation.getId())
                            .gt(since != null, ImMessage::getCreateTime, since));
            vo.setUnreadCount(unreadCount != null ? unreadCount.intValue() : 0);

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
            }
            vo.setMembers(memberVOs);

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
        if (request.getType() == 1) {
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

            if (request.getMemberIds() != null) {
                for (Long memberId : request.getMemberIds()) {
                    if (memberId.equals(userId)) {
                        continue;
                    }
                    ImConversationMember member = new ImConversationMember();
                    member.setConversationId(conversation.getId());
                    member.setUserId(memberId);
                    member.setRole("member");
                    member.setJoinTime(LocalDateTime.now());
                    member.setIsPinned(0);
                    conversationMemberMapper.insert(member);
                }
            }

            return buildConversationVO(conversation, userId);
        }

        throw new RuntimeException("Invalid conversation type: " + request.getType());
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
    public ImConversation getById(Long id) {
        return conversationMapper.selectById(id);
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

    private ConversationVO buildConversationVO(ImConversation conversation, Long userId) {
        ConversationVO vo = new ConversationVO();
        vo.setConversationId(conversation.getId());
        vo.setType(conversation.getType());
        vo.setName(conversation.getName());
        vo.setAvatar(conversation.getAvatar());
        vo.setLastMessage(conversation.getLastMessage());
        vo.setLastMessageTime(conversation.getLastMessageTime());
        vo.setUnreadCount(0);

        ImConversationMember selfMember = conversationMemberMapper.selectOne(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversation.getId())
                        .eq(ImConversationMember::getUserId, userId));
        vo.setIsPinned(selfMember != null ? selfMember.getIsPinned() : 0);

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
        }
        vo.setMembers(memberVOs);

        return vo;
    }
}
