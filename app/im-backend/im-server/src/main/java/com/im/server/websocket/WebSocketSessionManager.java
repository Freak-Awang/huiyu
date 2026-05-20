package com.im.server.websocket;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class WebSocketSessionManager {

    private static final Logger log = LoggerFactory.getLogger(WebSocketSessionManager.class);

    private final ConcurrentHashMap<Long, WebSocketSession> sessions = new ConcurrentHashMap<>();

    public void addSession(Long userId, WebSocketSession session) {
        WebSocketSession oldSession = sessions.put(userId, session);
        if (oldSession != null && oldSession.isOpen()) {
            try {
                oldSession.close();
            } catch (IOException e) {
                log.warn("Failed to close old session for userId={}", userId, e);
            }
        }
    }

    public void removeSession(Long userId) {
        sessions.remove(userId);
    }

    public WebSocketSession getSession(Long userId) {
        return sessions.get(userId);
    }

    public Set<Long> getOnlineUserIds() {
        return Collections.unmodifiableSet(sessions.keySet());
    }

    public boolean isOnline(Long userId) {
        return sessions.containsKey(userId);
    }

    public void sendToUser(Long userId, String message) {
        WebSocketSession session = sessions.get(userId);
        if (session == null) {
            return;
        }
        synchronized (session) {
            try {
                if (session.isOpen()) {
                    session.sendMessage(new TextMessage(message));
                }
            } catch (IOException e) {
                log.error("Failed to send message to userId={}", userId, e);
            }
        }
    }
}
