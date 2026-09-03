package com.im.server.websocket;

import org.junit.jupiter.api.Test;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class P2pTransferRegistryTest {

    @Test
    void capabilityIsBoundToTheAuthenticatedSession() {
        P2pTransferRegistry registry = new P2pTransferRegistry();
        WebSocketSession first = session("first", true);
        WebSocketSession closed = session("closed", false);

        registry.registerCapability(10L, first, 1);
        registry.registerCapability(10L, closed, 1);

        assertThat(registry.isCapable(first)).isTrue();
        assertThat(registry.hasCapableSession(10L)).isTrue();
        assertThat(registry.getCapableSessions(10L)).containsExactly(first);
        assertThat(registry.hasCapableSession(11L)).isFalse();
    }

    @Test
    void onlyTheRecipientCanClaimAndTheFirstReceiverSessionWins() {
        P2pTransferRegistry registry = new P2pTransferRegistry();
        WebSocketSession sourceSession = session("source", true);
        WebSocketSession receiverOne = session("receiver-one", true);
        WebSocketSession receiverTwo = session("receiver-two", true);
        P2pTransferRegistry.SourceRegistration source = new P2pTransferRegistry.SourceRegistration(
                "p2p_transfer", 100L, 20L, 10L, 11L, sourceSession);
        registry.registerSource(source);

        assertThat(registry.bindReceiver(source, 12L, receiverOne)).isNull();
        P2pTransferRegistry.Route route = registry.bindReceiver(source, 11L, receiverOne);

        assertThat(route).isNotNull();
        assertThat(registry.bindReceiver(source, 11L, receiverOne)).isSameAs(route);
        assertThat(registry.bindReceiver(source, 11L, receiverTwo)).isNull();
        assertThat(route.peerOf(sourceSession)).isSameAs(receiverOne);
        assertThat(route.peerOf(receiverOne)).isSameAs(sourceSession);
    }

    @Test
    void disconnectRemovesSourceAndRouteButReportsThePeerRouteForNotification() {
        P2pTransferRegistry registry = new P2pTransferRegistry();
        WebSocketSession sourceSession = session("source", true);
        WebSocketSession receiver = session("receiver", true);
        registry.registerCapability(10L, sourceSession, 1);
        P2pTransferRegistry.SourceRegistration source = new P2pTransferRegistry.SourceRegistration(
                "p2p_transfer", 100L, 20L, 10L, 11L, sourceSession);
        registry.registerSource(source);
        P2pTransferRegistry.Route route = registry.bindReceiver(source, 11L, receiver);

        P2pTransferRegistry.CleanupResult cleanup = registry.cleanupSession(sourceSession);

        assertThat(cleanup.removedCapability()).isTrue();
        assertThat(cleanup.removedRoutes()).containsExactly(route);
        assertThat(registry.getSource("p2p_transfer")).isNull();
        assertThat(registry.getRoute(route.routeId())).isNull();
    }

    private WebSocketSession session(String id, boolean open) {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(id);
        when(session.isOpen()).thenReturn(open);
        return session;
    }
}
