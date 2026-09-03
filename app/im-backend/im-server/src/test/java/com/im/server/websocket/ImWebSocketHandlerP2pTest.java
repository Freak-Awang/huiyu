package com.im.server.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.common.entity.ImConversation;
import com.im.common.entity.ImConversationMember;
import com.im.server.config.P2pTransferProperties;
import com.im.server.mapper.ConversationMapper;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.MessageMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.service.MessageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ImWebSocketHandlerP2pTest {

    @Mock private StringRedisTemplate redisTemplate;
    @Mock private MessageService messageService;
    @Mock private ConversationMapper conversationMapper;
    @Mock private ConversationMemberMapper conversationMemberMapper;
    @Mock private MessageMapper messageMapper;
    @Mock private UserMapper userMapper;
    @Mock private WebSocketSessionManager sessionManager;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private P2pTransferRegistry registry;
    private P2pTransferProperties properties;
    private ImWebSocketHandler handler;

    @BeforeEach
    void setUp() {
        registry = new P2pTransferRegistry();
        properties = new P2pTransferProperties();
        properties.setEnabled(true);
        handler = new ImWebSocketHandler(redisTemplate, messageService, conversationMapper,
                conversationMemberMapper, messageMapper, userMapper, sessionManager,
                registry, properties, objectMapper);
    }

    @Test
    void offlinePeerRejectsOfferWithoutCreatingAMessage() throws Exception {
        WebSocketSession sender = session("sender", 10L, true);
        registry.registerCapability(10L, sender, 1);
        when(conversationMapper.selectById(20L)).thenReturn(conversation(20L, 1));
        when(conversationMemberMapper.selectList(any())).thenReturn(List.of(member(20L, 10L), member(20L, 11L)));

        handler.handleTextMessage(sender, new TextMessage(offerPayload()));

        JsonNode response = lastResponse(sender);
        assertThat(response.path("cmd").asText()).isEqualTo("P2P_OFFER_CREATE");
        assertThat(response.path("data").path("ok").asBoolean()).isFalse();
        assertThat(response.path("data").path("code").asInt()).isEqualTo(409);
        verify(messageService, never()).sendP2pMessage(any(), any());
    }

    @Test
    void groupConversationRejectsP2pCapabilityQuery() throws Exception {
        WebSocketSession sender = session("sender", 10L, true);
        when(conversationMapper.selectById(20L)).thenReturn(conversation(20L, 2));

        handler.handleTextMessage(sender, new TextMessage(
                "{\"cmd\":\"P2P_PEER_STATUS\",\"seq\":2,\"data\":{\"conversationId\":20}}"));

        JsonNode response = lastResponse(sender);
        assertThat(response.path("data").path("ok").asBoolean()).isFalse();
        assertThat(response.path("data").path("code").asInt()).isEqualTo(400);
    }

    @Test
    void oversizedOrUnboundSignalIsRejectedInsteadOfForwarded() throws Exception {
        WebSocketSession sender = session("sender", 10L, true);
        properties.setMaxSignalBytes(16);

        handler.handleTextMessage(sender, new TextMessage(
                "{\"cmd\":\"P2P_SIGNAL\",\"seq\":3,\"data\":{\"routeId\":\"forged\","
                        + "\"signal\":{\"description\":\"this-is-too-large\"}}}"));

        JsonNode response = lastResponse(sender);
        assertThat(response.path("data").path("ok").asBoolean()).isFalse();
        assertThat(response.path("data").path("code").asInt()).isEqualTo(400);
    }

    @Test
    void authenticatedRouteForwardsOnlyAValidRoleBoundDescription() throws Exception {
        WebSocketSession sender = session("sender", 10L, true);
        WebSocketSession receiver = session("receiver", 11L, true);
        P2pTransferRegistry.SourceRegistration source = new P2pTransferRegistry.SourceRegistration(
                "p2p_transfer", 100L, 20L, 10L, 11L, sender);
        registry.registerSource(source);
        P2pTransferRegistry.Route route = registry.bindReceiver(source, 11L, receiver);

        handler.handleTextMessage(sender, new TextMessage(
                "{\"cmd\":\"P2P_SIGNAL\",\"data\":{\"routeId\":\"" + route.routeId() + "\","
                        + "\"signal\":{\"description\":{\"type\":\"offer\",\"sdp\":\"v=0\"}}}}"));

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(sessionManager).sendToSession(eq(receiver), payload.capture());
        JsonNode forwarded = objectMapper.readTree(payload.getValue());
        assertThat(forwarded.path("cmd").asText()).isEqualTo("P2P_SIGNAL");
        assertThat(forwarded.path("data").path("transferId").asText()).isEqualTo("p2p_transfer");
    }

    private JsonNode lastResponse(WebSocketSession session) throws Exception {
        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(sessionManager).sendToSession(eq(session), payload.capture());
        return objectMapper.readTree(payload.getValue());
    }

    private String offerPayload() {
        return "{\"cmd\":\"P2P_OFFER_CREATE\",\"seq\":1,\"data\":{" 
                + "\"conversationId\":20,\"clientMsgId\":\"client-1\",\"kind\":\"file\","
                + "\"name\":\"report.pdf\",\"totalSize\":10,\"fileCount\":1,"
                + "\"sha256\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}}";
    }

    private WebSocketSession session(String id, Long userId, boolean open) {
        WebSocketSession session = org.mockito.Mockito.mock(WebSocketSession.class);
        lenient().when(session.getId()).thenReturn(id);
        lenient().when(session.isOpen()).thenReturn(open);
        lenient().when(session.getAttributes()).thenReturn(Map.of("userId", userId));
        return session;
    }

    private ImConversation conversation(Long id, int type) {
        ImConversation conversation = new ImConversation();
        conversation.setId(id);
        conversation.setType(type);
        return conversation;
    }

    private ImConversationMember member(Long conversationId, Long userId) {
        ImConversationMember member = new ImConversationMember();
        member.setConversationId(conversationId);
        member.setUserId(userId);
        return member;
    }
}
