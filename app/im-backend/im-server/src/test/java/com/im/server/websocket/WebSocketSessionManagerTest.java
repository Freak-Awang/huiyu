package com.im.server.websocket;

import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * WebSocket Session 管理器测试，验证多端 session 管理和在线状态判断。
 *
 * <p>测试范围：WebSocketSessionManager 的 addSession、removeSession、sendToUser、
 * isOnline 方法，覆盖多端登录场景。</p>
 */
class WebSocketSessionManagerTest {

    /**
     * 验证同一用户两个 session 都收到 sendToUser 的消息，且 getSessions 返回全部 session，
     * isOnline 返回 true。
     */
    @Test
    void multipleSessionsForOneUserStayConnectedAndReceiveMessages() throws Exception {
        WebSocketSessionManager manager = new WebSocketSessionManager();
        WebSocketSession first = openSession("first");
        WebSocketSession second = openSession("second");

        manager.addSession(10L, first);
        manager.addSession(10L, second);
        manager.sendToUser(10L, "payload"); // 广播到两个 session

        assertThat(manager.getSessions(10L)).containsExactlyInAnyOrder(first, second);
        verify(first).sendMessage(new TextMessage("payload"));
        verify(second).sendMessage(new TextMessage("payload"));
        assertThat(manager.isOnline(10L)).isTrue();
    }

    /**
     * 验证多端登录时只有关闭最后一个 session 才变为离线：
     * 关闭第一个 session→仍在线(removeSession 返回 false)，
     * 关闭第二个 session→离线(removeSession 返回 true)。
     */
    @Test
    void userStaysOnlineUntilFinalSessionCloses() {
        WebSocketSessionManager manager = new WebSocketSessionManager();
        WebSocketSession first = openSession("first");
        WebSocketSession second = openSession("second");
        manager.addSession(10L, first);
        manager.addSession(10L, second);

        assertThat(manager.removeSession(10L, first)).isFalse(); // 还有第二个 session
        assertThat(manager.isOnline(10L)).isTrue(); // 仍在线
        assertThat(manager.removeSession(10L, second)).isTrue(); // 最后一个 session
        assertThat(manager.isOnline(10L)).isFalse(); // 离线
    }

    private WebSocketSession openSession(String id) {
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(id);
        when(session.isOpen()).thenReturn(true);
        return session;
    }
}
