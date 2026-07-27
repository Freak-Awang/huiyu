package com.im.server.websocket;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Collection;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Intent: WebSocketSessionManager owns realtime session routing and WebSocket message delivery semantics.
 */
@Component
public class WebSocketSessionManager {

    private static final Logger log = LoggerFactory.getLogger(WebSocketSessionManager.class);

    private final ConcurrentHashMap<Long, Set<WebSocketSession>> sessions = new ConcurrentHashMap<>();

    public void addSession(Long userId, WebSocketSession session) {
        sessions.computeIfAbsent(userId, ignored -> ConcurrentHashMap.newKeySet()).add(session);
    }

    /**
     * @return true when this was the user's final active session.
     */
    public boolean removeSession(Long userId, WebSocketSession session) {
        Set<WebSocketSession> userSessions = sessions.get(userId);
        if (userSessions == null || !userSessions.remove(session)) {
            return false;
        }
        if (userSessions.isEmpty()) {
            sessions.remove(userId, userSessions);
            return true;
        }
        return false;
    }

    public Collection<WebSocketSession> getSessions(Long userId) {
        Set<WebSocketSession> userSessions = sessions.get(userId);
        return userSessions == null ? Set.of() : Set.copyOf(userSessions);
    }

    public Set<Long> getOnlineUserIds() {
        return Set.copyOf(sessions.keySet());
    }

    public boolean isOnline(Long userId) {
        return sessions.containsKey(userId);
    }

    public void sendToUser(Long userId, String message) {
        for (WebSocketSession session : getSessions(userId)) {
            sendToSession(session, message);
        }
    }

    public void closeSessionsForUser(Long userId) {
        Set<WebSocketSession> userSessions = sessions.get(userId);
        if (userSessions == null) {
            return;
        }
        for (WebSocketSession session : new HashSet<>(userSessions)) {
            try {
                if (session.isOpen()) {
                    session.close();
                }
            } catch (IOException e) {
                log.warn("Failed to close session={} for userId={}", session.getId(), userId, e);
            }
        }
    }

    public void sendToSession(WebSocketSession session, String message) {
        synchronized (session) {
            try {
                if (session.isOpen()) {
                    session.sendMessage(new TextMessage(message));
                }
            } catch (IOException e) {
                log.error("Failed to send message to session={}", session.getId(), e);
            }
        }
    }
}
