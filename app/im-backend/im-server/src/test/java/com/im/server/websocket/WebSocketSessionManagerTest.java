package com.im.server.websocket;

import org.junit.jupiter.api.Test;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WebSocketSessionManagerTest {

    @Test
    void closingReplacedSessionDoesNotRemoveCurrentSession() throws Exception {
        WebSocketSessionManager manager = new WebSocketSessionManager();
        WebSocketSession oldSession = openSession("old");
        WebSocketSession newSession = openSession("new");

        manager.addSession(10L, oldSession);
        manager.addSession(10L, newSession);

        assertThat(manager.removeSession(10L, oldSession)).isFalse();
        assertThat(manager.getSession(10L)).isSameAs(newSession);
        assertThat(manager.isOnline(10L)).isTrue();
    }

    @Test
    void closingCurrentSessionRemovesRoutingEntry() {
        WebSocketSessionManager manager = new WebSocketSessionManager();
        WebSocketSession session = openSession("current");

        manager.addSession(10L, session);

        assertThat(manager.removeSession(10L, session)).isTrue();
        assertThat(manager.getSession(10L)).isNull();
        assertThat(manager.isOnline(10L)).isFalse();
    }

    private WebSocketSession openSession(String id) {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(id);
        when(session.isOpen()).thenReturn(true);
        return session;
    }
}
