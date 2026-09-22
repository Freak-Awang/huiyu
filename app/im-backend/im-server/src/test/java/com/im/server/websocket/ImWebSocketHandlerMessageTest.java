package com.im.server.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.common.entity.ImMessage;
import com.im.common.entity.ImConversationMember;
import com.im.common.exception.BusinessException;
import com.im.server.config.P2pTransferProperties;
import com.im.server.mapper.ConversationMapper;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.MessageMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.service.MessageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.Map;
import java.util.List;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class ImWebSocketHandlerMessageTest {
    private final ObjectMapper json = new ObjectMapper();
    private MessageService messages;
    private WebSocketSessionManager sessions;
    private WebSocketSession session;
    private ConversationMemberMapper members;
    private ImWebSocketHandler handler;

    @BeforeEach
    void setUp() {
        messages = mock(MessageService.class);
        sessions = mock(WebSocketSessionManager.class);
        session = mock(WebSocketSession.class);
        when(session.getAttributes()).thenReturn(Map.of("userId", 10L));
        members = mock(ConversationMemberMapper.class);
        handler = new ImWebSocketHandler(mock(StringRedisTemplate.class), messages,
                mock(ConversationMapper.class), members,
                mock(MessageMapper.class), mock(UserMapper.class), sessions,
                new P2pTransferRegistry(), new P2pTransferProperties(), json,
                mock(com.im.server.service.P2pShareService.class));
    }

    @Test
    void businessRejectionReturnsCorrelatedFailureInsteadOfLeavingSenderWaiting() throws Exception {
        when(messages.sendMessage(eq(10L), any())).thenThrow(new BusinessException(403, "Not a member"));
        JsonNode reply = send("{\"conversationId\":20,\"clientMsgId\":\"c1\",\"content\":\"hello\"}");
        assertThat(reply.path("cmd").asText()).isEqualTo("MESSAGE_SEND_REPLY");
        assertThat(reply.path("seq").asText()).isEqualTo("7");
        assertThat(reply.path("data").path("clientMsgId").asText()).isEqualTo("c1");
        assertThat(reply.path("data").path("status").asText()).isEqualTo("FAILED");
        assertThat(reply.path("data").path("ok").asBoolean()).isFalse();
        assertThat(reply.path("data").path("code").asInt()).isEqualTo(403);
    }

    @Test
    void unexpectedFailureDoesNotExposeInternalDetails() throws Exception {
        when(messages.sendMessage(eq(10L), any())).thenThrow(new IllegalStateException("internal database details"));
        JsonNode reply = send("{\"conversationId\":20,\"clientMsgId\":\"c1\",\"content\":\"hello\"}");
        assertThat(reply.path("data").path("code").asInt()).isEqualTo(500);
        assertThat(reply.toString()).doesNotContain("internal database details");
    }

    @Test
    void malformedSendAlsoReceivesFailure() throws Exception {
        JsonNode reply = send("{\"clientMsgId\":\"c1\"}");
        assertThat(reply.path("data").path("code").asInt()).isEqualTo(400);
        verifyNoInteractions(messages);
    }

    @Test
    void successfulSendStillReturnsServerIdAndOriginalClientId() throws Exception {
        ImMessage stored = new ImMessage();
        stored.setId(501L);
        stored.setConversationId(20L);
        stored.setSenderId(10L);
        stored.setClientMsgId("c1");
        stored.setMessageType("TEXT");
        stored.setContent("hello");
        stored.setCreateTime(LocalDateTime.of(2026, 9, 22, 15, 38));
        ImConversationMember recipient = new ImConversationMember();
        recipient.setUserId(11L);
        when(members.selectList(any())).thenReturn(List.of(recipient));
        when(sessions.isOnline(11L)).thenReturn(true);
        when(messages.sendMessage(eq(10L), any())).thenReturn(stored);
        JsonNode reply = send("{\"conversationId\":20,\"clientMsgId\":\"c1\",\"content\":\"hello\"}");
        assertThat(reply.path("cmd").asText()).isEqualTo("MESSAGE_ACK");
        assertThat(reply.path("data").path("messageId").asLong()).isEqualTo(501L);
        assertThat(reply.path("data").path("clientMsgId").asText()).isEqualTo("c1");
        ArgumentCaptor<String> received = ArgumentCaptor.forClass(String.class);
        verify(sessions).sendToUser(eq(11L), received.capture());
        String createdAt = json.readTree(received.getValue()).path("data").path("createdAt").asText();
        assertThat(OffsetDateTime.parse(createdAt).toInstant())
                .isEqualTo(stored.getCreateTime().atZone(ZoneId.systemDefault()).toInstant());
    }

    private JsonNode send(String data) throws Exception {
        handler.handleTextMessage(session, new TextMessage("{\"cmd\":\"MESSAGE_SEND\",\"seq\":7,\"data\":" + data + "}"));
        ArgumentCaptor<String> response = ArgumentCaptor.forClass(String.class);
        verify(sessions).sendToSession(eq(session), response.capture());
        return json.readTree(response.getValue());
    }
}
