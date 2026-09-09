package com.im.server.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.common.entity.ImConversation;
import com.im.common.entity.ImConversationMember;
import com.im.common.entity.ImMessage;
import com.im.common.entity.ImP2pShare;
import com.im.server.config.P2pTransferProperties;
import com.im.server.mapper.ConversationMapper;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.MessageMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.service.MessageService;
import com.im.server.service.P2pShareService;
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
import static org.mockito.Mockito.atLeastOnce;

@ExtendWith(MockitoExtension.class)
class ImWebSocketHandlerP2pTest {

    @Mock private StringRedisTemplate redisTemplate;
    @Mock private MessageService messageService;
    @Mock private P2pShareService shareService;
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
                registry, properties, objectMapper, shareService);
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

    @Test
    void negotiatesVersionTwoWithoutAdvertisingHigherVersions() throws Exception {
        WebSocketSession sender = session("sender", 10L, true);
        handler.handleTextMessage(sender, new TextMessage("{\"cmd\":\"CLIENT_CAPABILITIES\",\"seq\":1,\"data\":{\"p2pFileVersion\":9}}"));
        assertThat(lastResponse(sender).path("data").path("p2pFileVersion").asInt()).isEqualTo(2);
        assertThat(registry.version(sender)).isEqualTo(2);
    }

    @Test
    void acceptsVersionTwoEmptyFileAndEmptyRootFolder() throws Exception {
        WebSocketSession sender = session("sender", 10L, true);
        arrangeConversation(sender);
        for (String kind : List.of("file", "folder")) {
            String hashField = "file".equals(kind) ? "sha256" : "manifestSha256";
            String data = "{\"version\":2,\"conversationId\":20,\"kind\":\"" + kind + "\",\"name\":\"empty\","
                    + "\"totalSize\":0,\"fileCount\":" + ("file".equals(kind) ? 1 : 0) + ",\"directoryCount\":0,"
                    + "\"" + hashField + "\":\"" + "a".repeat(64) + "\"}";
            when(messageService.sendP2pMessage(eq(10L), any())).thenAnswer(invocation -> {
                com.im.common.dto.SendMessageRequest request = invocation.getArgument(1);
                ImMessage message = new ImMessage(); message.setId(100L); message.setSenderId(10L);
                message.setConversationId(20L); message.setContent(request.getContent()); message.setStatus("SENT");
                return message;
            });
            org.mockito.Mockito.doAnswer(invocation -> objectMapper.readTree(((ImMessage) invocation.getArgument(0)).getContent()))
                    .when(shareService).metadata(any());
            when(shareService.requireActive(any())).thenReturn(share());
            handler.handleTextMessage(sender, new TextMessage("{\"cmd\":\"P2P_OFFER_CREATE\",\"seq\":7,\"data\":" + data + "}"));
            JsonNode response = responseFor(sender, "P2P_OFFER_CREATE");
            assertThat(response.path("data").path("ok").asBoolean()).isTrue();
            assertThat(objectMapper.readTree(response.path("data").path("content").asText()).path("version").asInt()).isEqualTo(2);
        }
    }

    @Test
    void rejectsDirectoryCountOverflowAndFullManifestInOffer() throws Exception {
        WebSocketSession sender = session("sender", 10L, true);
        arrangeConversation(sender);
        String data = "{\"version\":2,\"conversationId\":20,\"kind\":\"folder\",\"name\":\"folder\","
                + "\"totalSize\":0,\"fileCount\":0,\"directoryCount\":10001,\"manifestSha256\":\"" + "a".repeat(64) + "\"}";
        handler.handleTextMessage(sender, new TextMessage("{\"cmd\":\"P2P_OFFER_CREATE\",\"seq\":7,\"data\":" + data + "}"));
        assertThat(responseFor(sender, "P2P_OFFER_CREATE").path("data").path("code").asInt()).isEqualTo(413);
        handler.handleTextMessage(sender, new TextMessage("{\"cmd\":\"P2P_OFFER_CREATE\",\"seq\":8,\"data\":{\"manifest\":{\"files\":[]}}}"));
        assertThat(responseFor(sender, "P2P_OFFER_CREATE").path("data").path("code").asInt()).isEqualTo(400);
        verify(messageService, never()).sendP2pMessage(any(), any());
    }

    @Test
    void rejectsVersionOneReceiverForVersionTwoShareBeforeBinding() throws Exception {
        WebSocketSession sender = session("sender", 10L, true), receiver = session("receiver", 11L, true);
        arrangeConversation(sender); registry.registerCapability(11L, receiver, 1);
        arrangeShare(sender);
        handler.handleTextMessage(receiver, new TextMessage("{\"cmd\":\"P2P_TRANSFER_REQUEST\",\"seq\":1,\"data\":{\"transferId\":\"p2p_transfer\"}}"));
        assertThat(lastResponse(receiver).path("data").path("code").asInt()).isEqualTo(409);
        assertThat(registry.hasRoute("p2p_transfer")).isFalse();
    }

    @Test
    void terminalAckIsIdempotentAndCompletionDoesNotReleaseTheSource() throws Exception {
        WebSocketSession sender = session("sender", 10L, true), receiver = session("receiver", 11L, true);
        registry.registerCapability(11L, receiver, 2);
        var source = new P2pTransferRegistry.SourceRegistration("p2p_transfer", 100L, 20L, 10L, 11L, sender);
        registry.registerSource(source); var route = registry.bindReceiver(source, 11L, receiver);
        String payload = "{\"cmd\":\"P2P_ROUTE_END\",\"seq\":5,\"data\":{\"transferId\":\"p2p_transfer\",\"routeId\":\""
                + route.routeId() + "\",\"reason\":\"completed\"}}";
        handler.handleTextMessage(receiver, new TextMessage(payload));
        handler.handleTextMessage(receiver, new TextMessage(payload));
        assertThat(responseFor(receiver, "P2P_ROUTE_END").path("data").path("alreadyEnded").asBoolean()).isTrue();
        assertThat(registry.getSource("p2p_transfer")).isSameAs(source);
        assertThat(registry.hasRoute("p2p_transfer")).isFalse();
    }

    @Test
    void pausedSourceRegistrationPublishesAvailabilityAndRejectsNewReceivers() throws Exception {
        WebSocketSession sender = session("sender", 10L, true), receiver = session("receiver", 11L, true);
        arrangeConversation(sender); registry.registerCapability(11L, receiver, 2);
        ImMessage message = arrangeShare(sender);
        JsonNode summary = objectMapper.readTree(message.getContent());
        var data = (com.fasterxml.jackson.databind.node.ObjectNode) summary;
        data.remove("transferMode"); data.put("messageId", 100L); data.put("paused", true);
        handler.handleTextMessage(sender, new TextMessage("{\"cmd\":\"P2P_SOURCE_REGISTER\",\"seq\":6,\"data\":" + data + "}"));
        assertThat(responseFor(sender, "P2P_SOURCE_REGISTER").path("data").path("ok").asBoolean()).isTrue();
        assertThat(registry.getSource("p2p_transfer").paused()).isTrue();
        assertThat(responseFor(receiver, "P2P_SHARE_STATE").path("data").path("state").asText()).isEqualTo("source_paused");
        handler.handleTextMessage(receiver, new TextMessage("{\"cmd\":\"P2P_TRANSFER_REQUEST\",\"seq\":7,\"data\":{\"transferId\":\"p2p_transfer\"}}"));
        assertThat(responseFor(receiver, "P2P_TRANSFER_REQUEST").path("data").path("message").asText()).isEqualTo("SOURCE_PAUSED");
    }

    private void arrangeConversation(WebSocketSession sender) {
        registry.registerCapability(10L, sender, 2);
        registry.registerCapability(11L, session("capable-receiver", 11L, true), 2);
        when(conversationMapper.selectById(20L)).thenReturn(conversation(20L, 1));
        when(conversationMemberMapper.selectList(any())).thenReturn(List.of(member(20L, 10L), member(20L, 11L)));
    }

    private ImP2pShare share() {
        ImP2pShare share = new ImP2pShare(); share.setTransferId("p2p_transfer"); share.setMessageId(100L);
        share.setState("ACTIVE"); share.setRevision(1L); return share;
    }

    private ImMessage arrangeShare(WebSocketSession sender) throws Exception {
        ImMessage message = new ImMessage(); message.setId(100L); message.setSenderId(10L); message.setConversationId(20L);
        message.setContent("{\"transferMode\":\"p2p_lan\",\"transferId\":\"p2p_transfer\",\"version\":2,\"kind\":\"file\","
                + "\"name\":\"empty\",\"totalSize\":0,\"fileCount\":1,\"directoryCount\":0,\"sha256\":\"" + "a".repeat(64) + "\"}");
        lenient().when(messageMapper.selectById(100L)).thenReturn(message);
        when(shareService.requireActive("p2p_transfer")).thenReturn(share());
        lenient().when(shareService.requireMessage(any())).thenReturn(message);
        when(shareService.metadata(message)).thenReturn(objectMapper.readTree(message.getContent()));
        registry.registerSource(new P2pTransferRegistry.SourceRegistration("p2p_transfer", 100L, 20L, 10L, 11L, sender));
        return message;
    }

    private JsonNode responseFor(WebSocketSession session, String command) throws Exception {
        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(sessionManager, atLeastOnce()).sendToSession(eq(session), payload.capture());
        JsonNode result = null;
        for (String value : payload.getAllValues()) {
            JsonNode candidate = objectMapper.readTree(value);
            if (command.equals(candidate.path("cmd").asText())) result = candidate;
        }
        assertThat(result).isNotNull(); return result;
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
