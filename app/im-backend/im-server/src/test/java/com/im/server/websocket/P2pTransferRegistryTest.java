package com.im.server.websocket;

import org.junit.jupiter.api.Test;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class P2pTransferRegistryTest {

    @Test
    void completionKeepsSourceAndAllowsTheNextDeviceToReceive() {
        P2pTransferRegistry registry = new P2pTransferRegistry();
        WebSocketSession sender = session("sender", true), first = session("first", true), next = session("next", true);
        var source = new P2pTransferRegistry.SourceRegistration("p2p_test", 1L, 2L, 10L, 11L, sender);
        registry.registerSource(source);
        var route = registry.bindReceiver(source, 11L, first);
        assertThat(registry.endRoute(route.routeId(), "p2p_test", first, "completed").alreadyEnded()).isFalse();
        assertThat(registry.getSource("p2p_test")).isSameAs(source);
        assertThat(registry.bindReceiver(source, 11L, next)).isNotNull();
    }

    @Test
    void oldRouteReplayCannotCancelANewAttempt() {
        P2pTransferRegistry registry = new P2pTransferRegistry();
        WebSocketSession sender = session("sender", true), receiver = session("receiver", true);
        var source = new P2pTransferRegistry.SourceRegistration("p2p_test", 1L, 2L, 10L, 11L, sender);
        registry.registerSource(source);
        var old = registry.bindReceiver(source, 11L, receiver);
        registry.endRoute(old.routeId(), "p2p_test", receiver, "paused");
        var current = registry.bindReceiver(source, 11L, receiver);
        var duplicate = registry.endRoute(old.routeId(), "p2p_test", receiver, "cancelled");
        assertThat(duplicate.alreadyEnded()).isTrue();
        assertThat(duplicate.reason()).isEqualTo("paused");
        assertThat(registry.getRoute(current.routeId())).isSameAs(current);
        assertThatThrownBy(() -> registry.endRoute(old.routeId(), "p2p_other", receiver, "cancelled"))
                .hasMessage("Invalid P2P route");
    }

    @Test
    void sourceCannotBeSilentlyTakenOverAndReregistrationPreservesGeneration() {
        P2pTransferRegistry registry = new P2pTransferRegistry();
        WebSocketSession sender = session("sender", true), other = session("other", true);
        var source = new P2pTransferRegistry.SourceRegistration("p2p_test", 1L, 2L, 10L, 11L, sender, "lease", "generation");
        registry.registerSource(source);
        registry.registerSource(new P2pTransferRegistry.SourceRegistration("p2p_test", 1L, 2L, 10L, 11L,
                sender, "lease", "discarded-generation", true));
        assertThat(registry.getSource("p2p_test").sourceGeneration()).isEqualTo("generation");
        assertThat(registry.getSource("p2p_test").paused()).isTrue();
        assertThatThrownBy(() -> registry.registerSource(new P2pTransferRegistry.SourceRegistration(
                "p2p_test", 1L, 2L, 10L, 11L, other))).hasMessage("SOURCE_BUSY");
    }

    @Test
    void terminalAcknowledgmentsRemainBoundToOriginalParticipants() {
        P2pTransferRegistry registry = new P2pTransferRegistry();
        WebSocketSession sender = session("sender", true), receiver = session("receiver", true), stranger = session("stranger", true);
        var source = new P2pTransferRegistry.SourceRegistration("p2p_test", 1L, 2L, 10L, 11L, sender);
        registry.registerSource(source);
        var route = registry.bindReceiver(source, 11L, receiver);
        registry.invalidateShare("p2p_test", "recalled");
        assertThat(registry.endRoute(route.routeId(), "p2p_test", receiver, "completed").reason()).isEqualTo("recalled");
        assertThatThrownBy(() -> registry.endRoute(route.routeId(), "p2p_test", stranger, "cancelled"))
                .hasMessage("Invalid P2P route");
        WebSocketSession reconnected = session("receiver-reconnected", true);
        when(reconnected.getAttributes()).thenReturn(java.util.Map.of("userId", 11L));
        assertThat(registry.endRoute(route.routeId(), "p2p_test", reconnected, "cancelled").alreadyEnded()).isTrue();
    }

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
