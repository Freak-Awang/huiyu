package com.im.server.websocket;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * P2P 控制面的临时注册表。只保存在线能力、源会话和已绑定的信令路由；
 * 不保存文件、目录清单、SDP 或 ICE candidate。
 */
@Component
public class P2pTransferRegistry {

    private final ConcurrentHashMap<String, Capability> capabilities = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, SourceRegistration> sources = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Route> routes = new ConcurrentHashMap<>();

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
                                     Long senderId, Long recipientId, WebSocketSession sourceSession) {
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
}
