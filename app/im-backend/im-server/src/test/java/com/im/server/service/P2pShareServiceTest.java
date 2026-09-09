package com.im.server.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.common.entity.ImMessage;
import com.im.common.entity.ImP2pShare;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.MessageMapper;
import com.im.server.mapper.P2pShareMapper;
import com.im.server.websocket.P2pTransferRegistry;
import com.im.server.websocket.WebSocketSessionManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.socket.WebSocketSession;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class P2pShareServiceTest {
    private P2pShareMapper shares;
    private MessageMapper messages;
    private P2pTransferRegistry registry;
    private WebSocketSessionManager sessions;
    private P2pShareService service;
    private ImP2pShare share;
    private ImMessage message;
    private TransactionTemplate transaction;

    @BeforeEach
    void setup() {
        shares = mock(P2pShareMapper.class); messages = mock(MessageMapper.class);
        registry = new P2pTransferRegistry(); sessions = mock(WebSocketSessionManager.class);
        ConversationMemberMapper members = mock(ConversationMemberMapper.class);
        when(members.selectList(any())).thenReturn(List.of());
        service = new P2pShareService(shares, messages, registry, sessions, new ObjectMapper(), members);
        share = new ImP2pShare(); share.setTransferId("p2p_test"); share.setMessageId(1L);
        share.setState("ACTIVE"); share.setRevision(1L);
        message = new ImMessage(); message.setId(1L); message.setSenderId(10L); message.setConversationId(20L);
        message.setStatus("SENT"); message.setContent("{\"transferMode\":\"p2p_lan\",\"transferId\":\"p2p_test\"}");
        when(shares.selectById("p2p_test")).thenReturn(share);
        when(shares.selectOne(any())).thenReturn(share);
        when(messages.selectById(1L)).thenReturn(message);
        var source = new P2pTransferRegistry.SourceRegistration("p2p_test", 1L, 20L, 10L, 11L, session("source"));
        registry.registerSource(source); registry.bindReceiver(source, 11L, session("receiver"));
        transaction = new TransactionTemplate(new AbstractPlatformTransactionManager() {
            @Override protected Object doGetTransaction() { return new Object(); }
            @Override protected void doBegin(Object transaction, TransactionDefinition definition) { }
            @Override protected void doCommit(DefaultTransactionStatus status) { }
            @Override protected void doRollback(DefaultTransactionStatus status) { }
        });
    }

    @Test
    void stopInvalidatesOnlyAfterCommitAndKeepsControlLockUntilCompletion() throws Exception {
        transaction.executeWithoutResult(status -> {
            service.stop("p2p_test", 10L);
            assertThat(registry.getSource("p2p_test")).isNotNull();
            verifyNoInteractions(sessions);
            try {
                assertThat(CompletableFuture.supplyAsync(() -> {
                    boolean acquired = registry.controlLock().tryLock();
                    if (acquired) registry.controlLock().unlock();
                    return acquired;
                }).get(2, TimeUnit.SECONDS)).isFalse();
            } catch (Exception e) { throw new AssertionError(e); }
        });
        assertThat(registry.getSource("p2p_test")).isNull();
        assertThat(registry.hasRoute("p2p_test")).isFalse();
        assertThat(share.getState()).isEqualTo("STOPPED");
        assertThat(share.getRevision()).isEqualTo(2);
        assertThat(registry.controlLock().isLocked()).isFalse();
        verify(sessions, atLeastOnce()).sendToUser(eq(11L), contains("P2P_SHARE_STATE"));
    }

    @Test
    void rollbackLeavesLiveSourceAndRouteIntactAndSendsNoInvalidation() {
        assertThatThrownBy(() -> transaction.executeWithoutResult(status -> {
            service.stop("p2p_test", 10L);
            throw new IllegalStateException("database transaction failed");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(registry.getSource("p2p_test")).isNotNull();
        assertThat(registry.hasRoute("p2p_test")).isTrue();
        assertThat(registry.controlLock().isLocked()).isFalse();
        verifyNoInteractions(sessions);
    }

    @Test
    void receiverCannotPermanentlyStopSendersShare() {
        assertThatThrownBy(() -> service.stop("p2p_test", 11L)).hasMessage("Only the sender can stop sharing");
        verify(shares, never()).updateById(any(ImP2pShare.class));
        assertThat(registry.getSource("p2p_test")).isNotNull();
    }

    @Test
    void repeatedStopIsIdempotentAndCannotResurrectARecalledShare() {
        service.stop("p2p_test", 10L); service.stop("p2p_test", 10L);
        assertThat(share.getRevision()).isEqualTo(2);
        verify(shares, times(1)).updateById(any(ImP2pShare.class));
        assertThatThrownBy(() -> service.requireActive("p2p_test")).hasMessage("SHARE_STOPPED");
        service.recall(message);
        service.stop("p2p_test", 10L);
        assertThat(share.getState()).isEqualTo("RECALLED");
        assertThat(share.getRevision()).isEqualTo(3);
    }

    @Test
    void recallInvalidatesBeforeControlLockIsReleasedAndBlocksStaleRegistration() {
        transaction.executeWithoutResult(status -> {
            try (var ignored = service.guardTransaction()) {
                service.recall(message);
                message.setStatus("RECALLED"); message.setContent("");
                assertThat(registry.getSource("p2p_test")).isNotNull();
            }
        });
        assertThat(registry.getSource("p2p_test")).isNull();
        assertThatThrownBy(() -> service.requireActive("p2p_test")).hasMessage("SHARE_RECALLED");
        assertThat(registry.controlLock().isLocked()).isFalse();
    }

    @Test
    void deduplicatedMessageKeepsOriginalAuthorization() {
        assertThat(service.ensureShare(message)).isSameAs(share);
        share.setState("STOPPED");
        assertThat(service.ensureShare(message).getState()).isEqualTo("STOPPED");
        verify(shares, never()).insert(any(ImP2pShare.class));
    }

    private WebSocketSession session(String id) {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(id); when(session.isOpen()).thenReturn(true);
        return session;
    }
}
