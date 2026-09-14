package com.im.server.service.impl;

import com.im.common.entity.ImConversation;
import com.im.common.entity.ImConversationMember;
import com.im.common.entity.ImMessage;
import com.im.common.exception.BusinessException;
import com.im.server.mapper.ConversationMapper;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.MessageMapper;
import com.im.server.service.P2pShareService;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.LocalDateTime;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ContextMenuPermissionsTest {
    @ParameterizedTest
    @CsvSource({"member,member,false", "admin,member,true", "admin,admin,false", "admin,owner,false", "owner,admin,true", "owner,member,true"})
    void removalAlwaysChecksServerMembership(String role, String targetRole, boolean allowed) {
        ConversationServiceImpl service = new ConversationServiceImpl();
        ConversationMapper conversations = mock(ConversationMapper.class);
        ConversationMemberMapper members = mock(ConversationMemberMapper.class);
        ReflectionTestUtils.setField(service, "conversationMapper", conversations);
        ReflectionTestUtils.setField(service, "conversationMemberMapper", members);
        ImConversation conversation = new ImConversation();
        conversation.setId(10L); conversation.setType(2);
        ImConversationMember operator = new ImConversationMember();
        operator.setId(1L); operator.setUserId(1L); operator.setRole(role);
        ImConversationMember target = new ImConversationMember();
        target.setId(2L); target.setUserId(2L); target.setRole(targetRole);
        when(conversations.selectById(10L)).thenReturn(conversation);
        when(conversations.selectOne(any())).thenReturn(conversation);
        when(members.selectOne(any())).thenReturn(operator, target);
        when(members.selectCount(any())).thenReturn(2L);
        if (allowed) {
            service.removeMember(10L, 2L, 1L);
            verify(members).deleteById(2L);
        } else {
            assertThatThrownBy(() -> service.removeMember(10L, 2L, 1L)).isInstanceOf(BusinessException.class);
            verify(members, never()).deleteById(2L);
        }
    }

    @ParameterizedTest
    @CsvSource({"2,0", "1,3"})
    void recallRejectsAnotherSenderOrExpiredMessage(long operatorId, int ageMinutes) {
        MessageServiceImpl service = new MessageServiceImpl();
        MessageMapper messages = mock(MessageMapper.class);
        ReflectionTestUtils.setField(service, "messageMapper", messages);
        ReflectionTestUtils.setField(service, "p2pShareService", mock(P2pShareService.class));
        ImMessage message = new ImMessage();
        message.setId(10L); message.setSenderId(1L); message.setCreateTime(LocalDateTime.now().minusMinutes(ageMinutes));
        when(messages.selectById(10L)).thenReturn(message);
        assertThatThrownBy(() -> service.recallMessage(operatorId, 10L)).isInstanceOf(BusinessException.class);
        verify(messages, never()).updateById(any(ImMessage.class));
    }
}
