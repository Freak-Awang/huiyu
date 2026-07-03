package com.im.server.service.impl;

import com.im.common.dto.SendMessageRequest;
import com.im.common.result.PageResult;
import com.im.common.entity.ImConversation;
import com.im.common.entity.ImConversationMember;
import com.im.common.entity.ImFile;
import com.im.common.entity.ImMessage;
import com.im.common.dto.MessageVO;
import com.im.common.exception.BusinessException;
import com.im.common.entity.SysUser;
import com.im.server.mapper.ConversationMapper;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.MessageDeliveryMapper;
import com.im.server.mapper.MessageMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.service.FileMetadataService;
import com.im.server.websocket.WebSocketSessionManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MessageServiceImplTest {

    @Mock
    private MessageMapper messageMapper;

    @Mock
    private MessageDeliveryMapper messageDeliveryMapper;

    @Mock
    private ConversationMapper conversationMapper;

    @Mock
    private ConversationMemberMapper conversationMemberMapper;

    @Mock
    private UserMapper userMapper;

    @Mock
    private WebSocketSessionManager sessionManager;

    @Mock
    private FileMetadataService fileMetadataService;

    @InjectMocks
    private MessageServiceImpl messageService;

    @Test
    void ownerCanSendAllMention() {
        arrangeSend("owner", 2);

        ImMessage message = messageService.sendMessage(10L, allMentionRequest());

        assertThat(message.getContent()).contains("\"type\":\"all\"");
        assertThat(message.getExpiresAt()).isNull();
        verify(messageMapper).insert(any(ImMessage.class));
    }

    @Test
    void adminCanSendAllMention() {
        arrangeSend("admin", 2);

        ImMessage message = messageService.sendMessage(10L, allMentionRequest());

        assertThat(message.getContent()).contains("\"userId\":\"__ALL__\"");
        verify(messageMapper).insert(any(ImMessage.class));
    }

    @Test
    void memberCannotSendAllMention() {
        arrangeSenderAndConversation("member", 2);

        assertThatThrownBy(() -> messageService.sendMessage(10L, allMentionRequest()))
                .isInstanceOf(BusinessException.class)
                .hasMessage("只有群主和群管理员可以@所有人")
                .extracting("code")
                .isEqualTo(403);
        verifyNoInteractions(messageMapper);
    }

    @Test
    void allMentionIsRejectedInSingleConversation() {
        arrangeSenderAndConversation("owner", 1);

        assertThatThrownBy(() -> messageService.sendMessage(10L, allMentionRequest()))
                .isInstanceOf(BusinessException.class)
                .hasMessage("@所有人只能在群聊中使用")
                .extracting("code")
                .isEqualTo(403);
        verifyNoInteractions(messageMapper);
    }

    @Test
    void memberCanStillSendRegularMention() {
        arrangeSend("member", 2);

        ImMessage message = messageService.sendMessage(10L, regularMentionRequest());

        assertThat(message.getContent()).contains("\"userId\":\"11\"");
        verify(messageMapper).insert(any(ImMessage.class));
    }

    @Test
    void malformedFileMessageIsRejected() {
        when(conversationMemberMapper.selectOne(any())).thenReturn(member(10L, "member"));

        assertThatThrownBy(() -> messageService.sendMessage(10L, fileMessageRequest()))
                .isInstanceOf(BusinessException.class)
                .hasMessage("Invalid file message content")
                .extracting("code")
                .isEqualTo(400);
        verifyNoInteractions(messageMapper);
    }

    @Test
    void validFileMessageIsSent() {
        arrangeSend("member", 2);
        when(fileMetadataService.getById(1L)).thenReturn(file(1L, 1L));

        ImMessage message = messageService.sendMessage(10L, validFileMessageRequest());

        assertThat(message.getMessageType()).isEqualTo("FILE");
        assertThat(message.getContent()).contains("\"fileName\":\"report.pdf\"");
        verify(messageMapper).insert(any(ImMessage.class));
    }

    @Test
    void getMessagesIncludesSenderSignature() {
        ImMessage message = new ImMessage();
        message.setId(100L);
        message.setConversationId(1L);
        message.setSenderId(10L);
        message.setMessageType("TEXT");
        message.setContent("hello");
        message.setStatus("SENT");
        when(conversationMemberMapper.selectOne(any())).thenReturn(member(11L, "member"));
        when(messageMapper.selectCount(any())).thenReturn(1L);
        when(messageMapper.selectList(any())).thenReturn(List.of(message));
        when(userMapper.selectById(10L)).thenReturn(user(10L));
        when(messageDeliveryMapper.selectCount(any())).thenReturn(0L);

        PageResult<MessageVO> page = messageService.getMessages(11L, 1L, null, 50);

        assertThat(page.getData()).singleElement().satisfies(vo -> {
            assertThat(vo.getSenderName()).isEqualTo("用户10");
            assertThat(vo.getSenderSignature()).isEqualTo("签名10");
        });
    }

    private void arrangeSend(String role, int conversationType) {
        arrangeSenderAndConversation(role, conversationType);
        when(messageMapper.insert(any(ImMessage.class))).thenAnswer(invocation -> {
            ImMessage message = invocation.getArgument(0);
            message.setId(100L);
            return 1;
        });
        when(conversationMemberMapper.selectList(any())).thenReturn(List.of(member(10L, role), member(11L, "member")));
    }

    private void arrangeSenderAndConversation(String role, int conversationType) {
        when(conversationMemberMapper.selectOne(any())).thenReturn(member(10L, role));
        when(conversationMapper.selectById(1L)).thenReturn(conversation(conversationType));
    }

    private SendMessageRequest allMentionRequest() {
        SendMessageRequest request = new SendMessageRequest();
        request.setConversationId(1L);
        request.setMessageType("TEXT");
        request.setContent("{\"text\":\"@所有人 开会\",\"mentions\":[{\"type\":\"all\",\"userId\":\"__ALL__\",\"nickname\":\"所有人\"}],\"replyTo\":null}");
        return request;
    }

    private SendMessageRequest regularMentionRequest() {
        SendMessageRequest request = new SendMessageRequest();
        request.setConversationId(1L);
        request.setMessageType("TEXT");
        request.setContent("{\"text\":\"@张三 看一下\",\"mentions\":[{\"type\":\"user\",\"userId\":\"11\",\"nickname\":\"张三\"}],\"replyTo\":null}");
        return request;
    }

    private ImConversation conversation(int type) {
        ImConversation conversation = new ImConversation();
        conversation.setId(1L);
        conversation.setType(type);
        return conversation;
    }

    private SendMessageRequest fileMessageRequest() {
        SendMessageRequest request = new SendMessageRequest();
        request.setConversationId(1L);
        request.setMessageType("FILE");
        request.setContent("{\"fileId\":1}");
        return request;
    }

    private SendMessageRequest validFileMessageRequest() {
        SendMessageRequest request = new SendMessageRequest();
        request.setConversationId(1L);
        request.setMessageType("FILE");
        request.setContent("{\"fileId\":1,\"fileName\":\"report.pdf\",\"fileSize\":5,\"transferMode\":\"object_storage\"}");
        return request;
    }

    private ImFile file(Long fileId, Long conversationId) {
        ImFile file = new ImFile();
        file.setId(fileId);
        file.setConversationId(conversationId);
        file.setStatus(FileMetadataService.STATUS_AVAILABLE);
        return file;
    }

    private ImConversationMember member(Long userId, String role) {
        ImConversationMember member = new ImConversationMember();
        member.setId(userId);
        member.setConversationId(1L);
        member.setUserId(userId);
        member.setRole(role);
        member.setIsPinned(0);
        member.setIsMuted(0);
        return member;
    }

    private SysUser user(Long userId) {
        SysUser user = new SysUser();
        user.setId(userId);
        user.setNickname("用户" + userId);
        user.setSignature("签名" + userId);
        return user;
    }
}
