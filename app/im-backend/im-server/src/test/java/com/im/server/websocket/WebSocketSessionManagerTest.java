package com.im.server.websocket;

import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WebSocketSessionManagerTest {

    @Test
    void multipleSessionsForOneUserStayConnectedAndReceiveMessages() throws Exception {
        WebSocketSessionManager manager = new WebSocketSessionManager();
        WebSocketSession first = openSession("first");
        WebSocketSession second = openSession("second");

        manager.addSession(10L, first);
        manager.addSession(10L, second);
        manager.sendToUser(10L, "payload");

        assertThat(manager.getSessions(10L)).containsExactlyInAnyOrder(first, second);
        verify(first).sendMessage(new TextMessage("payload"));
        verify(second).sendMessage(new TextMessage("payload"));
        assertThat(manager.isOnline(10L)).isTrue();
    }

    @Test
    void userStaysOnlineUntilFinalSessionCloses() {
        WebSocketSessionManager manager = new WebSocketSessionManager();
        WebSocketSession first = openSession("first");
        WebSocketSession second = openSession("second");
        manager.addSession(10L, first);
        manager.addSession(10L, second);

        assertThat(manager.removeSession(10L, first)).isFalse();
        assertThat(manager.isOnline(10L)).isTrue();
        assertThat(manager.removeSession(10L, second)).isTrue();
        assertThat(manager.isOnline(10L)).isFalse();
    }

    private WebSocketSession openSession(String id) {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(id);
        when(session.isOpen()).thenReturn(true);
        return session;
    }
}
