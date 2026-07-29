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
 * WebSocket Session 管理器，负责维护 userId 与 WebSocketSession 的映射关系。
 *
 * <p>设计要点：</p>
 * <ul>
 *   <li>使用 ConcurrentHashMap 保证并发安全，每个 userId 可持有多个 session（支持多端登录）。</li>
 *   <li>addSession/removeSession 管理 session 生命周期；removeSession 仅在用户无剩余 session 时返回 true。</li>
 *   <li>sendToSession 方法使用 synchronized 保证单 session 的消息发送串行化，防止并发写入导致帧乱序。</li>
 *   <li>sendToUser 将消息发送到该用户的所有活跃 session，实现多端同步。</li>
 * </ul>
 */
@Component
public class WebSocketSessionManager {

    private static final Logger log = LoggerFactory.getLogger(WebSocketSessionManager.class);

    // userId → Set<WebSocketSession>：同一用户多端登录时持有多个 session
    private final ConcurrentHashMap<Long, Set<WebSocketSession>> sessions = new ConcurrentHashMap<>();

    /**
     * 注册 session：若该用户首次连接则创建新的 Set，后续连接追加到已有 Set。
     */
    public void addSession(Long userId, WebSocketSession session) {
        sessions.computeIfAbsent(userId, ignored -> ConcurrentHashMap.newKeySet()).add(session);
    }

    /**
     * 移除 session。
     *
     * @return true 表示这是该用户最后一个活跃 session（需要清理 Redis 在线标记）；
     *         false 表示用户仍有其他活跃 session 或 session 不存在。
     */
    public boolean removeSession(Long userId, WebSocketSession session) {
        Set<WebSocketSession> userSessions = sessions.get(userId);
        if (userSessions == null || !userSessions.remove(session)) {
            return false;
        }
        if (userSessions.isEmpty()) {
            sessions.remove(userId, userSessions); // 无剩余 session，彻底清理
            return true;
        }
        return false;
    }

    /**
     * 获取用户的全部 session 快照（不可变集合）。
     */
    public Collection<WebSocketSession> getSessions(Long userId) {
        Set<WebSocketSession> userSessions = sessions.get(userId);
        return userSessions == null ? Set.of() : Set.copyOf(userSessions);
    }

    /**
     * 获取当前所有在线用户 ID 的快照。
     */
    public Set<Long> getOnlineUserIds() {
        return Set.copyOf(sessions.keySet());
    }

    /**
     * 判断用户是否在线（至少有 1 个活跃 session）。
     */
    public boolean isOnline(Long userId) {
        return sessions.containsKey(userId);
    }

    /**
     * 向用户的所有 session 广播消息，实现多端同步接收。
     */
    public void sendToUser(Long userId, String message) {
        for (WebSocketSession session : getSessions(userId)) {
            sendToSession(session, message);
        }
    }

    /**
     * 强制关闭用户的所有 session（如管理员踢下线场景）。
     */
    public void closeSessionsForUser(Long userId) {
        Set<WebSocketSession> userSessions = sessions.get(userId);
        if (userSessions == null) {
            return;
        }
        for (WebSocketSession session : new HashSet<>(userSessions)) { // 拷贝后遍历，避免并发修改
            try {
                if (session.isOpen()) {
                    session.close();
                }
            } catch (IOException e) {
                log.warn("Failed to close session={} for userId={}", session.getId(), userId, e);
            }
        }
    }

    /**
     * 向单个 session 发送文本消息，使用 synchronized 保证同一 session 的发送串行化。
     * WebSocket 规范要求同一 session 的消息必须串行发送，否则可能帧乱序。
     */
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
