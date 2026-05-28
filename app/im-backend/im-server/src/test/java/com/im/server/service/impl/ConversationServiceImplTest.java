package com.im.server.service.impl;

import com.im.common.dto.ConversationVO;
import com.im.common.entity.ImConversation;
import com.im.common.entity.ImConversationMember;
import com.im.common.entity.ImMessage;
import com.im.common.entity.SysUser;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.server.mapper.ConversationMapper;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.MessageMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.websocket.WebSocketSessionManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConversationServiceImplTest {

    @Mock
    private ConversationMapper conversationMapper;

    @Mock
    private ConversationMemberMapper conversationMemberMapper;

    @Mock
    private MessageMapper messageMapper;

    @Mock
    private UserMapper userMapper;

    @Mock
    private WebSocketSessionManager sessionManager;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private ConversationServiceImpl conversationService;

    @Test
    void allMentionCountsAsMentionUnreadForGroupMember() {
        ImConversationMember selfMember = member(11L, "member");
        selfMember.setLastReadTime(LocalDateTime.now().minusMinutes(5));
        ImMessage allMentionMessage = new ImMessage();
        allMentionMessage.setId(100L);
        allMentionMessage.setConversationId(1L);
        allMentionMessage.setSenderId(10L);
        allMentionMessage.setMessageType("TEXT");
        allMentionMessage.setStatus("SENT");
        allMentionMessage.setContent("{\"text\":\"@所有人 开会\",\"mentions\":[{\"type\":\"all\",\"userId\":\"__ALL__\",\"nickname\":\"所有人\"}]}");
        allMentionMessage.setExpiresAt(LocalDateTime.now().plusDays(1));

        when(conversationMemberMapper.selectOne(any())).thenReturn(selfMember, selfMember);
        when(conversationMapper.selectById(1L)).thenReturn(conversation());
        when(messageMapper.selectList(any())).thenReturn(List.of(allMentionMessage));
        when(conversationMemberMapper.selectList(any())).thenReturn(List.of(member(10L, "owner"), selfMember));
        when(userMapper.selectById(any())).thenAnswer(invocation -> user(invocation.getArgument(0)));

        ConversationVO vo = conversationService.getById(1L, 11L);

        assertThat(vo.getMentionUnreadCount()).isEqualTo(1);
    }

    private ImConversation conversation() {
        ImConversation conversation = new ImConversation();
        conversation.setId(1L);
        conversation.setType(2);
        conversation.setName("测试群");
        return conversation;
    }

    private ImConversationMember member(Long userId, String role) {
        ImConversationMember member = new ImConversationMember();
        member.setId(userId);
        member.setConversationId(1L);
        member.setUserId(userId);
        member.setRole(role);
        member.setIsPinned(0);
        member.setIsMuted(0);
        member.setJoinTime(LocalDateTime.now().minusDays(1));
        return member;
    }

    private SysUser user(Long userId) {
        SysUser user = new SysUser();
        user.setId(userId);
        user.setNickname("用户" + userId);
        return user;
    }
}
