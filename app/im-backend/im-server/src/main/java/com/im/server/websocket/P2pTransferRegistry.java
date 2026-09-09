package com.im.server.websocket;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import com.im.common.exception.BusinessException;

/**
 * P2P 控制面的临时注册表。只保存在线能力、源会话和已绑定的信令路由；
 * 不保存文件、目录清单、SDP 或 ICE candidate。
 */
@Component
public class P2pTransferRegistry {

    private final ConcurrentHashMap<String, Capability> capabilities = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, SourceRegistration> sources = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Route> routes = new ConcurrentHashMap<>();
    private final LinkedHashMap<String, EndedRoute> endedRoutes = new LinkedHashMap<>();
    private final ReentrantLock controlLock = new ReentrantLock();

    // The existing online routing registry is process-local. All durable transitions and
    // route creation/forwarding use this lock, including transaction completion callbacks.
    public ReentrantLock controlLock() { return controlLock; }

    public void controlled(Runnable action) {
        controlLock.lock();
        try { action.run(); } finally { controlLock.unlock(); }
    }

    public int version(WebSocketSession session) {
        Capability item = capabilities.get(session.getId());
        return item != null && session.isOpen() ? item.version() : 0;
    }

    public int maxVersion(Long userId) {
        return capabilities.values().stream()
                .filter(item -> item.userId().equals(userId) && item.session().isOpen())
                .mapToInt(Capability::version).max().orElse(0);
    }

    public void registerCapability(Long userId, WebSocketSession session, int version) {
        if (version >= 1) {
            capabilities.put(session.getId(), new Capability(userId, session, version));
        } else {
            capabilities.remove(session.getId());
        }
    }

    public boolean hasCapableSession(Long userId) {
        return capabilities.values().stream()
                .anyMatch(item -> item.userId().equals(userId) && item.session().isOpen());
    }

    public boolean isCapable(WebSocketSession session) {
        Capability capability = capabilities.get(session.getId());
        return capability != null && capability.version() >= 1 && session.isOpen();
    }

    public Collection<WebSocketSession> getCapableSessions(Long userId) {
        return capabilities.values().stream()
                .filter(item -> item.userId().equals(userId) && item.session().isOpen())
                .map(Capability::session)
                .toList();
    }

    public synchronized void registerSource(SourceRegistration source) {
        SourceRegistration current = getSource(source.transferId());
        if (current != null && !sameSession(current.sourceSession(), source.sourceSession())) {
            throw new BusinessException(409, "SOURCE_BUSY");
        }
        if (current != null && current.registrationId().equals(source.registrationId())) {
            sources.put(source.transferId(), new SourceRegistration(source.transferId(), source.messageId(),
                    source.conversationId(), source.senderId(), source.recipientId(), source.sourceSession(),
                    current.registrationId(), current.sourceGeneration(), source.paused()));
            return;
        }
        if (current != null && routes.values().stream().anyMatch(route -> route.transferId().equals(source.transferId()))) {
            throw new BusinessException(409, "SOURCE_BUSY");
        }
        sources.put(source.transferId(), source);
    }

    public synchronized SourceRegistration getSource(String transferId) {
        SourceRegistration source = sources.get(transferId);
        if (source == null || !source.sourceSession().isOpen()) {
            if (source != null) {
                sources.remove(transferId, source);
            }
            return null;
        }
        return source;
    }

    public synchronized boolean unregisterSource(String transferId, WebSocketSession sourceSession) {
        SourceRegistration source = sources.get(transferId);
        return source != null
                && source.sourceSession().getId().equals(sourceSession.getId())
                && sources.remove(transferId, source);
    }

    /** First accepting receiver session wins for a transfer. */
    public synchronized Route bindReceiver(SourceRegistration source, Long receiverId,
                                           WebSocketSession receiverSession) {
        if (sources.get(source.transferId()) != source || !source.sourceSession().isOpen()) {
            return null;
        }
        Route active = routes.values().stream()
                .filter(route -> route.transferId().equals(source.transferId()))
                .findFirst()
                .orElse(null);
        if (active != null) {
            if (active.receiverSession().getId().equals(receiverSession.getId())) {
                return active;
            }
            return null;
        }
        if (!source.recipientId().equals(receiverId)) {
            return null;
        }
        Route route = new Route(
                "route_" + UUID.randomUUID().toString().replace("-", ""),
                source.transferId(), source.conversationId(), source.senderId(), receiverId,
                source.sourceSession(), receiverSession);
        routes.put(route.routeId(), route);
        return route;
    }

    public Route getRoute(String routeId) {
        return routes.get(routeId);
    }

    public synchronized Route removeRoute(String routeId) {
        return routes.remove(routeId);
    }

    public synchronized EndedRoute endRoute(String routeId, String transferId, WebSocketSession session, String reason) {
        EndedRoute ended = endedRoutes.get(routeId);
        Route route = ended == null ? routes.get(routeId) : ended.route();
        if (route == null) throw new BusinessException(410, "ROUTE_EXPIRED");
        Object userId = session.getAttributes().get("userId");
        boolean endedParticipant = ended != null && (route.sourceUserId().equals(userId) || route.receiverUserId().equals(userId));
        if ((!route.contains(session) && !endedParticipant) || !route.transferId().equals(transferId)) {
            throw new BusinessException(403, "Invalid P2P route");
        }
        if (ended != null) return new EndedRoute(route, ended.reason(), true);
        routes.remove(routeId);
        EndedRoute result = new EndedRoute(route, reason, false);
        rememberEnded(result);
        return result;
    }

    private void rememberEnded(EndedRoute ended) {
        endedRoutes.put(ended.route().routeId(), ended);
        while (endedRoutes.size() > 10_000) endedRoutes.remove(endedRoutes.keySet().iterator().next());
    }

    public synchronized List<Route> invalidateShare(String transferId, String reason) {
        sources.remove(transferId);
        List<Route> removed = removeRoutesForTransfer(transferId);
        for (Route route : removed) rememberEnded(new EndedRoute(route, reason, false));
        return removed;
    }

    public boolean hasRoute(String transferId) {
        return routes.values().stream().anyMatch(route -> route.transferId().equals(transferId));
    }

    public synchronized List<Route> removeRoutesForTransfer(String transferId) {
        List<Route> removed = new ArrayList<>();
        for (Route route : List.copyOf(routes.values())) {
            if (route.transferId().equals(transferId) && routes.remove(route.routeId(), route)) {
                removed.add(route);
            }
        }
        return removed;
    }

    public synchronized CleanupResult cleanupSession(WebSocketSession session) {
        boolean removedCapability = capabilities.remove(session.getId()) != null;
        List<Route> removedRoutes = new ArrayList<>();
        for (Route route : List.copyOf(routes.values())) {
            if (sameSession(route.sourceSession(), session) || sameSession(route.receiverSession(), session)) {
                if (routes.remove(route.routeId(), route)) {
                    removedRoutes.add(route);
                    rememberEnded(new EndedRoute(route, "peer_disconnected", false));
                }
            }
        }
        for (SourceRegistration source : List.copyOf(sources.values())) {
            if (sameSession(source.sourceSession(), session)) {
                sources.remove(source.transferId(), source);
            }
        }
        return new CleanupResult(removedCapability, removedRoutes);
    }

    public Collection<SourceRegistration> getSourcesForSession(WebSocketSession session) {
        return sources.values().stream()
                .filter(source -> sameSession(source.sourceSession(), session))
                .toList();
    }

    private boolean sameSession(WebSocketSession left, WebSocketSession right) {
        return left.getId().equals(right.getId());
    }

    public record Capability(Long userId, WebSocketSession session, int version) {
    }

    public record SourceRegistration(String transferId, Long messageId, Long conversationId,
                                     Long senderId, Long recipientId, WebSocketSession sourceSession,
                                     String registrationId, String sourceGeneration, boolean paused) {
        public SourceRegistration(String transferId, Long messageId, Long conversationId,
                                  Long senderId, Long recipientId, WebSocketSession sourceSession,
                                  String registrationId, String sourceGeneration) {
            this(transferId, messageId, conversationId, senderId, recipientId, sourceSession,
                    registrationId, sourceGeneration, false);
        }
        public SourceRegistration(String transferId, Long messageId, Long conversationId,
                                  Long senderId, Long recipientId, WebSocketSession sourceSession) {
            this(transferId, messageId, conversationId, senderId, recipientId, sourceSession,
                    sourceSession.getId(), UUID.randomUUID().toString(), false);
        }
    }

    public record Route(String routeId, String transferId, Long conversationId,
                        Long sourceUserId, Long receiverUserId,
                        WebSocketSession sourceSession, WebSocketSession receiverSession) {

        public boolean contains(WebSocketSession session) {
            return sourceSession.getId().equals(session.getId())
                    || receiverSession.getId().equals(session.getId());
        }

        public WebSocketSession peerOf(WebSocketSession session) {
            if (sourceSession.getId().equals(session.getId())) {
                return receiverSession;
            }
            if (receiverSession.getId().equals(session.getId())) {
                return sourceSession;
            }
            return null;
        }

        public String roleOf(WebSocketSession session) {
            return sourceSession.getId().equals(session.getId()) ? "source" : "receiver";
        }
    }

    public record CleanupResult(boolean removedCapability, List<Route> removedRoutes) {
    }

    public record EndedRoute(Route route, String reason, boolean alreadyEnded) { }
}
