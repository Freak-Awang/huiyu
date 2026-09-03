package com.im.server.websocket;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.im.common.dto.SendMessageRequest;
import com.im.common.entity.ImConversation;
import com.im.common.entity.ImConversationMember;
import com.im.common.entity.ImMessage;
import com.im.common.entity.SysUser;
import com.im.common.exception.BusinessException;
import com.im.server.config.P2pTransferProperties;
import com.im.server.mapper.ConversationMapper;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.MessageMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.service.MessageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * WebSocket 核心消息处理器，负责连接建立/鉴权、消息分发、心跳、推送及在线状态管理。
 *
 * <p>基于 Spring TextWebSocketHandler，通过 JSON 协议（cmd 字段）进行消息分发：
 * MESSAGE_SEND（发送消息并落库+推送）、MESSAGE_ACK（投递确认）、
 * MESSAGE_READ（已读标记）、ONLINE_STATUS（在线状态查询/变更）、
 * PING/PONG（心跳保活）。</p>
 *
 * <p>连接建立时从 Session attributes 读取握手阶段注入的 userId，
 * 连接关闭时清除 Redis 在线标记并通知会话成员离线。</p>
 */
@Component
public class ImWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(ImWebSocketHandler.class);

    // Redis 键前缀：在线标记（online:userId → "1"）和在线状态（presence:userId → online/busy/away/dnd/invisible）
    private static final String REDIS_ONLINE_PREFIX = "online:";
    private static final String REDIS_PRESENCE_PREFIX = "presence:";
    // 在线状态枚举值：online(在线)、busy(忙碌)、away(离开)、dnd(勿扰)、invisible(隐身)、offline(离线)
    private static final String PRESENCE_ONLINE = "online";
    private static final String PRESENCE_BUSY = "busy";
    private static final String PRESENCE_AWAY = "away";
    private static final String PRESENCE_DND = "dnd";
    private static final String PRESENCE_INVISIBLE = "invisible";
    private static final String PRESENCE_OFFLINE = "offline";
    // WebSocket JSON 协议命令字
    private static final String CMD_PING = "PING";
    private static final String CMD_PONG = "PONG";
    private static final String CMD_MESSAGE_SEND = "MESSAGE_SEND";
    private static final String CMD_MESSAGE_ACK = "MESSAGE_ACK";
    private static final String CMD_MESSAGE_RECEIVE = "MESSAGE_RECEIVE";
    private static final String CMD_MESSAGE_READ = "MESSAGE_READ";
    private static final String CMD_ONLINE_STATUS = "ONLINE_STATUS";
    private static final String CMD_CLIENT_CAPABILITIES = "CLIENT_CAPABILITIES";
    private static final String CMD_P2P_PEER_STATUS = "P2P_PEER_STATUS";
    private static final String CMD_P2P_OFFER_CREATE = "P2P_OFFER_CREATE";
    private static final String CMD_P2P_SOURCE_REGISTER = "P2P_SOURCE_REGISTER";
    private static final String CMD_P2P_TRANSFER_REQUEST = "P2P_TRANSFER_REQUEST";
    private static final String CMD_P2P_SIGNAL = "P2P_SIGNAL";
    private static final String CMD_P2P_TRANSFER_CANCEL = "P2P_TRANSFER_CANCEL";
    private static final String CMD_P2P_TRANSFER_CLAIMED = "P2P_TRANSFER_CLAIMED";

    private final StringRedisTemplate redisTemplate;
    private final MessageService messageService;
    private final ConversationMapper conversationMapper;
    private final ConversationMemberMapper conversationMemberMapper;
    private final MessageMapper messageMapper;
    private final UserMapper userMapper;
    private final WebSocketSessionManager sessionManager;
    private final P2pTransferRegistry p2pRegistry;
    private final P2pTransferProperties p2pProperties;
    private final ObjectMapper objectMapper;

    public ImWebSocketHandler(StringRedisTemplate redisTemplate,
                              MessageService messageService,
                              ConversationMapper conversationMapper,
                              ConversationMemberMapper conversationMemberMapper,
                              MessageMapper messageMapper,
                              UserMapper userMapper,
                              WebSocketSessionManager sessionManager,
                              P2pTransferRegistry p2pRegistry,
                              P2pTransferProperties p2pProperties,
                              ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.messageService = messageService;
        this.conversationMapper = conversationMapper;
        this.conversationMemberMapper = conversationMemberMapper;
        this.messageMapper = messageMapper;
        this.userMapper = userMapper;
        this.sessionManager = sessionManager;
        this.p2pRegistry = p2pRegistry;
        this.p2pProperties = p2pProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * 连接建立回调：从 Session attributes 取出握手阶段注入的 userId，
     * 写入内存 SessionManager 和 Redis 在线标记，并通知会话成员用户上线。
     */
    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        // 握手阶段已解析 userId；连接建立后立即写入内存 session 和 Redis presence，供消息路由和在线状态查询使用。
        Long userId = (Long) session.getAttributes().get("userId");
        if (userId == null) {
            log.warn("No userId in session attributes, closing connection");
            try {
                session.close();
            } catch (Exception ignored) {
            }
            return;
        }

        sessionManager.addSession(userId, session);
        // 写入 Redis：在线标记 + 默认在线状态
        redisTemplate.opsForValue().set(REDIS_ONLINE_PREFIX + userId, "1");
        redisTemplate.opsForValue().set(REDIS_PRESENCE_PREFIX + userId, PRESENCE_ONLINE);
        log.info("User {} connected, session={}", userId, session.getId());

        // 广播上线状态给所有有共同会话的用户
        notifyOnlineStatusChange(userId, PRESENCE_ONLINE);
    }

    /**
     * 文本消息入口：解析 JSON 中的 cmd 字段，按命令字分发到对应处理方法。
     *
     * <p>支持的命令：PING（心跳）、MESSAGE_SEND（发送消息→落库→ACK→推送给会话成员）、
     * MESSAGE_ACK（投递确认）、MESSAGE_READ（已读标记）、ONLINE_STATUS（在线状态查询/变更）。</p>
     */
    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        Long senderId = (Long) session.getAttributes().get("userId");
        if (senderId == null) {
            return;
        }

        String payload = message.getPayload();
        try {
            JsonNode root = objectMapper.readTree(payload);
            // cmd: 命令字，seq: 客户端请求序号（用于 ACK 回传实现请求-响应匹配）
            String cmd = root.has("cmd") ? root.get("cmd").asText() : null;
            String seq = root.has("seq") ? root.get("seq").asText() : null;

            if (cmd == null) {
                return;
            }

            switch (cmd) {
                case CMD_PING:
                    // 心跳：收到 PING 回复 PONG，保持长连接活跃
                    handlePing(session, seq);
                    break;
                case CMD_MESSAGE_SEND:
                    // 发送消息：落库、回 ACK、推送给会话其他成员
                    handleMessageSend(session, senderId, root, seq);
                    break;
                case CMD_MESSAGE_ACK:
                    // 客户端收到消息后的投递确认，更新消息状态
                    handleMessageAck(senderId, root);
                    break;
                case CMD_MESSAGE_READ:
                    // 会话已读标记，更新 lastReadMessageId
                    handleMessageRead(senderId, root);
                    break;
                case CMD_ONLINE_STATUS:
                    // 在线状态：查询指定用户/会话成员的状态，或更新自己的状态
                    handleOnlineStatus(session, senderId, root, seq);
                    break;
                case CMD_CLIENT_CAPABILITIES:
                    handleClientCapabilities(session, senderId, root, seq);
                    break;
                case CMD_P2P_PEER_STATUS:
                    handleP2pPeerStatus(session, senderId, root, seq);
                    break;
                case CMD_P2P_OFFER_CREATE:
                    handleP2pOfferCreate(session, senderId, root, seq);
                    break;
                case CMD_P2P_SOURCE_REGISTER:
                    handleP2pSourceRegister(session, senderId, root, seq);
                    break;
                case CMD_P2P_TRANSFER_REQUEST:
                    handleP2pTransferRequest(session, senderId, root, seq);
                    break;
                case CMD_P2P_SIGNAL:
                    handleP2pSignal(session, root, seq);
                    break;
                case CMD_P2P_TRANSFER_CANCEL:
                    handleP2pTransferCancel(session, root, seq);
                    break;
                default:
                    log.debug("Unknown command: {}", cmd);
            }
        } catch (Exception e) {
            log.error("Error handling message from userId={}: {}", senderId, e.getMessage(), e);
        }
    }

    /**
     * 连接关闭回调：统一走断连处理逻辑。
     */
    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        handleDisconnect(session);
    }

    /**
     * 传输异常回调：记录错误日志后按断连处理，确保资源清理。
     */
    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("Transport error for session={}: {}", session.getId(), exception.getMessage());
        handleDisconnect(session);
    }

    /**
     * 断连处理：从 SessionManager 移除该 session。
     * 仅当该用户无其他活跃 session 时才清除 Redis 在线标记并广播离线状态，
     * 支持同一用户多端登录场景。
     */
    private void handleDisconnect(WebSocketSession session) {
        Long userId = (Long) session.getAttributes().get("userId");
        if (userId == null) {
            return;
        }

        P2pTransferRegistry.CleanupResult cleanup = p2pRegistry.cleanupSession(session);
        for (P2pTransferRegistry.Route route : cleanup.removedRoutes()) {
            WebSocketSession peer = route.peerOf(session);
            if (peer != null && peer.isOpen()) {
                ObjectNode data = objectMapper.createObjectNode();
                data.put("routeId", route.routeId());
                data.put("transferId", route.transferId());
                data.put("reason", "peer_disconnected");
                sendCommand(peer, CMD_P2P_TRANSFER_CANCEL, null, data);
            }
            if (route.receiverSession().getId().equals(session.getId())
                    && p2pRegistry.getSource(route.transferId()) != null) {
                notifyP2pTransferClaim(route.receiverUserId(), route.transferId(), false, session);
            }
        }

        // removeSession 返回 true 表示这是该用户最后一个活跃 session
        if (!sessionManager.removeSession(userId, session)) {
            if (cleanup.removedCapability()) {
                notifyP2pCapabilityChange(userId);
            }
            log.debug("User still has another active session: userId={}, closedSession={}",
                    userId, session.getId());
            return;
        }
        // 清除 Redis 中的在线标记和状态
        redisTemplate.delete(REDIS_ONLINE_PREFIX + userId);
        redisTemplate.delete(REDIS_PRESENCE_PREFIX + userId);
        log.info("User {} disconnected, session={}", userId, session.getId());

        // 广播离线状态给所有有共同会话的用户
        notifyOnlineStatusChange(userId, PRESENCE_OFFLINE);
        if (cleanup.removedCapability()) {
            notifyP2pCapabilityChange(userId);
        }
    }

    /**
     * 心跳处理：收到 PING 回复 PONG，携带原始 seq 便于客户端计算 RTT。
     */
    private void handlePing(WebSocketSession session, String seq) {
        try {
            ObjectNode response = objectMapper.createObjectNode();
            response.put("cmd", CMD_PONG);
            if (seq != null) {
                response.put("seq", seq);
            }
            sessionManager.sendToSession(session, objectMapper.writeValueAsString(response));
        } catch (Exception e) {
            log.error("Error sending PONG", e);
        }
    }

    /**
     * 消息发送处理：解析消息数据→调用 MessageService 落库（复用 HTTP 发送的校验和幂等逻辑）
     * →回 ACK 给发送方→推送给会话其他在线成员。
     */
    private void handleMessageSend(WebSocketSession session, Long senderId, JsonNode root, String seq) {
        try {
            // MessageService 统一处理 WebSocket 和 HTTP 发送，共享校验、幂等、投递行逻辑
            JsonNode data = root.get("data");
            if (data == null) {
                return;
            }

            Long conversationId = data.has("conversationId") ? data.get("conversationId").asLong() : null;
            String messageType = data.has("messageType") ? data.get("messageType").asText() : "TEXT";
            String content = data.has("content") ? data.get("content").asText() : null;
            String clientMsgId = data.has("clientMsgId") ? data.get("clientMsgId").asText() : null; // 客户端幂等 ID

            if (conversationId == null || content == null) {
                log.warn("Invalid MESSAGE_SEND data: conversationId={}, content={}", conversationId, content);
                return;
            }

            SendMessageRequest request = new SendMessageRequest();
            request.setConversationId(conversationId);
            request.setMessageType(messageType);
            request.setContent(content);
            request.setClientMsgId(clientMsgId);

            // 落库（含幂等校验）
            ImMessage msg = messageService.sendMessage(senderId, request);

            // 1. 回 ACK 给发送方，告知消息已入库
            sendAck(session, seq, msg, clientMsgId);

            // 2. 推送给会话中其他在线成员
            pushMessageToConversationMembers(conversationId, senderId, msg);

        } catch (Exception e) {
            log.error("Error processing MESSAGE_SEND from userId={}", senderId, e);
        }
    }

    /**
     * 发送 ACK 给消息发送方，告知消息已入库（status=SENT）。
     * 携带 clientMsgId 供客户端做乐观更新去重，回传 seq 实现请求-响应匹配。
     * 直接发送到当前 session 而非广播，避免重连/多端场景下投递到错误连接。
     */
    private void sendAck(WebSocketSession session, String seq, ImMessage msg, String clientMsgId) {
        try {
            ObjectNode ack = objectMapper.createObjectNode();
            ack.put("cmd", CMD_MESSAGE_ACK);
            if (seq != null) {
                ack.put("seq", seq); // 回传请求序号
            }
            ObjectNode ackData = ack.putObject("data");
            ackData.put("messageId", msg.getId()); // 服务端生成的消息 ID
            if (clientMsgId != null) {
                ackData.put("clientMsgId", clientMsgId); // 客户端幂等 ID
            }
            ackData.put("status", "SENT");
            ackData.put("timestamp", System.currentTimeMillis());

            // 仅回给当前请求的 session，防止重连或并发替换导致 ACK 发到错误的连接
            sessionManager.sendToSession(session, objectMapper.writeValueAsString(ack));
        } catch (Exception e) {
            log.error("Error sending ACK for messageId={}", msg.getId(), e);
        }
    }

    /**
     * 投递确认：客户端收到消息后上报，标记该消息已送达。
     */
    private void handleMessageAck(Long userId, JsonNode root) {
        JsonNode data = root.get("data");
        Long messageId = data != null && data.has("messageId") ? data.get("messageId").asLong() : null;
        if (messageId == null) {
            return;
        }
        messageService.acknowledgeMessage(userId, messageId);
    }

    private void handleClientCapabilities(WebSocketSession session, Long userId, JsonNode root, String seq) {
        JsonNode data = root.get("data");
        int requestedVersion = data != null ? data.path("p2pFileVersion").asInt(0) : 0;
        int activeVersion = p2pProperties.isEnabled() && requestedVersion >= 1 ? 1 : 0;
        p2pRegistry.registerCapability(userId, session, activeVersion);

        ObjectNode response = objectMapper.createObjectNode();
        response.put("ok", true);
        response.put("enabled", p2pProperties.isEnabled());
        response.put("p2pFileVersion", activeVersion);
        sendCommand(session, CMD_CLIENT_CAPABILITIES, seq, response);
        notifyP2pCapabilityChange(userId);
    }

    private void handleP2pPeerStatus(WebSocketSession session, Long userId, JsonNode root, String seq) {
        try {
            ensureP2pEnabled();
            Long conversationId = requiredLong(root.path("data"), "conversationId");
            Long peerId = directPeer(conversationId, userId);
            ObjectNode response = objectMapper.createObjectNode();
            response.put("ok", true);
            response.put("conversationId", conversationId);
            response.put("userId", peerId);
            response.put("available", p2pRegistry.hasCapableSession(peerId));
            sendCommand(session, CMD_P2P_PEER_STATUS, seq, response);
        } catch (BusinessException e) {
            sendP2pError(session, CMD_P2P_PEER_STATUS, seq, e);
        }
    }

    private void handleP2pOfferCreate(WebSocketSession session, Long senderId, JsonNode root, String seq) {
        try {
            ensureP2pEnabled();
            if (!p2pRegistry.isCapable(session)) {
                throw new BusinessException(403, "P2P file transfer requires a compatible desktop client");
            }
            JsonNode data = requiredObject(root, "data");
            Long conversationId = requiredLong(data, "conversationId");
            Long recipientId = directPeer(conversationId, senderId);
            if (!p2pRegistry.hasCapableSession(recipientId)) {
                throw new BusinessException(409, "The peer desktop client is offline");
            }

            String kind = requiredText(data, "kind").toLowerCase();
            if (!"file".equals(kind) && !"folder".equals(kind)) {
                throw new BusinessException(400, "Invalid P2P attachment kind");
            }
            String name = requiredText(data, "name").trim();
            if (name.length() > 255) {
                throw new BusinessException(400, "Attachment name is too long");
            }
            long totalSize = requiredLong(data, "totalSize");
            int fileCount = data.path("fileCount").asInt(-1);
            validateP2pLimits(kind, totalSize, fileCount);
            String hashField = "file".equals(kind) ? "sha256" : "manifestSha256";
            String hash = requiredText(data, hashField).toLowerCase();
            if (!hash.matches("^[0-9a-f]{64}$")) {
                throw new BusinessException(400, "Invalid attachment checksum");
            }

            String transferId = "p2p_" + UUID.randomUUID().toString().replace("-", "");
            ObjectNode content = objectMapper.createObjectNode();
            content.put("version", 1);
            content.put("transferMode", "p2p_lan");
            content.put("transferId", transferId);
            content.put("kind", kind);
            content.put("name", name);
            content.put("totalSize", totalSize);
            content.put("fileCount", fileCount);
            content.put(hashField, hash);
            if ("file".equals(kind)) {
                content.put("fileName", name);
                content.put("fileSize", totalSize);
            } else {
                content.put("folderName", name);
            }

            SendMessageRequest request = new SendMessageRequest();
            request.setConversationId(conversationId);
            request.setMessageType("file".equals(kind) ? "FILE" : "FOLDER");
            request.setContent(objectMapper.writeValueAsString(content));
            request.setClientMsgId(data.path("clientMsgId").asText(null));
            ImMessage message = messageService.sendP2pMessage(senderId, request);

            P2pMessageMetadata stored = parseStoredP2pMessage(message, senderId);
            Long storedRecipient = directPeer(message.getConversationId(), senderId);
            p2pRegistry.registerSource(new P2pTransferRegistry.SourceRegistration(
                    stored.transferId(), message.getId(), message.getConversationId(), senderId,
                    storedRecipient, session));

            ObjectNode response = objectMapper.createObjectNode();
            response.put("ok", true);
            response.put("transferId", stored.transferId());
            response.put("messageId", message.getId());
            response.put("conversationId", message.getConversationId());
            response.put("messageType", message.getMessageType());
            response.put("content", message.getContent());
            response.put("clientMsgId", message.getClientMsgId());
            response.put("status", message.getStatus());
            response.put("createdAt", message.getCreateTime() != null ? message.getCreateTime().toString() : null);
            sendCommand(session, CMD_P2P_OFFER_CREATE, seq, response);
            pushMessageToConversationMembers(message.getConversationId(), senderId, message);
        } catch (BusinessException e) {
            sendP2pError(session, CMD_P2P_OFFER_CREATE, seq, e);
        } catch (Exception e) {
            log.error("Failed to create P2P offer for userId={}", senderId, e);
            sendP2pError(session, CMD_P2P_OFFER_CREATE, seq,
                    new BusinessException(500, "Failed to create P2P offer"));
        }
    }

    private void handleP2pSourceRegister(WebSocketSession session, Long senderId, JsonNode root, String seq) {
        try {
            ensureP2pEnabled();
            if (!p2pRegistry.isCapable(session)) {
                throw new BusinessException(403, "P2P file transfer requires a compatible desktop client");
            }
            JsonNode data = requiredObject(root, "data");
            Long messageId = requiredLong(data, "messageId");
            String transferId = requiredText(data, "transferId");
            ImMessage message = messageMapper.selectById(messageId);
            P2pMessageMetadata metadata = parseStoredP2pMessage(message, senderId);
            if (!metadata.transferId().equals(transferId)) {
                throw new BusinessException(403, "Transfer does not belong to this message");
            }
            Long recipientId = directPeer(message.getConversationId(), senderId);
            p2pRegistry.registerSource(new P2pTransferRegistry.SourceRegistration(
                    transferId, messageId, message.getConversationId(), senderId, recipientId, session));
            ObjectNode response = objectMapper.createObjectNode();
            response.put("ok", true);
            response.put("transferId", transferId);
            sendCommand(session, CMD_P2P_SOURCE_REGISTER, seq, response);
        } catch (BusinessException e) {
            sendP2pError(session, CMD_P2P_SOURCE_REGISTER, seq, e);
        }
    }

    private void handleP2pTransferRequest(WebSocketSession receiverSession, Long receiverId,
                                          JsonNode root, String seq) {
        try {
            ensureP2pEnabled();
            if (!p2pRegistry.isCapable(receiverSession)) {
                throw new BusinessException(403, "P2P file transfer requires a compatible desktop client");
            }
            String transferId = requiredText(requiredObject(root, "data"), "transferId");
            P2pTransferRegistry.SourceRegistration source = p2pRegistry.getSource(transferId);
            if (source == null) {
                throw new BusinessException(410, "The source file is no longer available");
            }
            P2pTransferRegistry.Route route = p2pRegistry.bindReceiver(source, receiverId, receiverSession);
            if (route == null) {
                throw new BusinessException(409, "This transfer is already being received on another device");
            }

            ObjectNode forwarded = objectMapper.createObjectNode();
            forwarded.put("transferId", transferId);
            forwarded.put("routeId", route.routeId());
            sendCommand(source.sourceSession(), CMD_P2P_TRANSFER_REQUEST, null, forwarded);

            ObjectNode response = forwarded.deepCopy();
            response.put("ok", true);
            response.put("state", "routing");
            sendCommand(receiverSession, CMD_P2P_TRANSFER_REQUEST, seq, response);

            for (WebSocketSession other : p2pRegistry.getCapableSessions(receiverId)) {
                if (!other.getId().equals(receiverSession.getId())) {
                    ObjectNode claimed = objectMapper.createObjectNode();
                    claimed.put("transferId", transferId);
                    claimed.put("claimed", true);
                    sendCommand(other, CMD_P2P_TRANSFER_CLAIMED, null, claimed);
                }
            }
        } catch (BusinessException e) {
            sendP2pError(receiverSession, CMD_P2P_TRANSFER_REQUEST, seq, e);
        }
    }

    private void handleP2pSignal(WebSocketSession session, JsonNode root, String seq) {
        try {
            ensureP2pEnabled();
            JsonNode data = requiredObject(root, "data");
            String routeId = requiredText(data, "routeId");
            JsonNode signal = data.get("signal");
            if (signal == null || !signal.isObject()
                    || objectMapper.writeValueAsBytes(signal).length > p2pProperties.getMaxSignalBytes()) {
                throw new BusinessException(400, "Invalid or oversized P2P signal");
            }
            P2pTransferRegistry.Route route = p2pRegistry.getRoute(routeId);
            if (route == null || !route.contains(session)) {
                throw new BusinessException(403, "Invalid P2P route");
            }
            validateP2pSignal(route, session, signal);
            WebSocketSession peer = route.peerOf(session);
            if (peer == null || !peer.isOpen()) {
                throw new BusinessException(410, "The peer disconnected");
            }
            ObjectNode forwarded = objectMapper.createObjectNode();
            forwarded.put("routeId", routeId);
            forwarded.put("transferId", route.transferId());
            forwarded.put("fromRole", route.roleOf(session));
            forwarded.set("signal", signal);
            sendCommand(peer, CMD_P2P_SIGNAL, null, forwarded);
            if (seq != null) {
                ObjectNode response = objectMapper.createObjectNode();
                response.put("ok", true);
                response.put("routeId", routeId);
                sendCommand(session, CMD_P2P_SIGNAL, seq, response);
            }
        } catch (BusinessException e) {
            sendP2pError(session, CMD_P2P_SIGNAL, seq, e);
        } catch (Exception e) {
            sendP2pError(session, CMD_P2P_SIGNAL, seq,
                    new BusinessException(400, "Invalid P2P signal"));
        }
    }

    private void handleP2pTransferCancel(WebSocketSession session, JsonNode root, String seq) {
        try {
            JsonNode data = requiredObject(root, "data");
            String routeId = data.path("routeId").asText("");
            String transferId = data.path("transferId").asText("");
            String reason = data.path("reason").asText("cancelled");
            boolean releaseSource = data.path("releaseSource").asBoolean(false);
            if (reason.length() > 64) {
                throw new BusinessException(400, "Invalid P2P cancellation reason");
            }
            if (!routeId.isBlank()) {
                P2pTransferRegistry.Route route = p2pRegistry.getRoute(routeId);
                if (route == null || !route.contains(session)) {
                    throw new BusinessException(403, "Invalid P2P route");
                }
                if (!transferId.isBlank() && !route.transferId().equals(transferId)) {
                    throw new BusinessException(403, "Transfer does not match the P2P route");
                }
                if (releaseSource && !route.sourceSession().getId().equals(session.getId())) {
                    throw new BusinessException(403, "Only the source session can stop sharing this transfer");
                }
                boolean keepRoute = !releaseSource
                        && ("paused".equals(reason) || "peer_disconnected".equals(reason));
                if (!keepRoute) {
                    p2pRegistry.removeRoute(routeId);
                }
                if (releaseSource) {
                    p2pRegistry.unregisterSource(route.transferId(), session);
                } else if ("completed".equals(reason) && "receiver".equals(route.roleOf(session))) {
                    p2pRegistry.unregisterSource(route.transferId(), route.sourceSession());
                }
                WebSocketSession peer = route.peerOf(session);
                if (peer != null && peer.isOpen()) {
                    ObjectNode forwarded = objectMapper.createObjectNode();
                    forwarded.put("routeId", routeId);
                    forwarded.put("transferId", route.transferId());
                    forwarded.put("reason", reason);
                    sendCommand(peer, CMD_P2P_TRANSFER_CANCEL, null, forwarded);
                }
                if (releaseSource) {
                    notifyP2pTransferUnavailable(route.receiverUserId(), route.transferId(), peer);
                } else if ("receiver".equals(route.roleOf(session)) && "cancelled".equals(reason)) {
                    notifyP2pTransferClaim(route.receiverUserId(), route.transferId(), false, session);
                }
            } else if (!transferId.isBlank()) {
                P2pTransferRegistry.SourceRegistration source = p2pRegistry.getSource(transferId);
                if (source == null || !source.sourceSession().getId().equals(session.getId())
                        || !p2pRegistry.unregisterSource(transferId, session)) {
                    throw new BusinessException(403, "Only the source session can stop sharing this transfer");
                }
                for (P2pTransferRegistry.Route route : p2pRegistry.removeRoutesForTransfer(transferId)) {
                    WebSocketSession peer = route.peerOf(session);
                    if (peer != null && peer.isOpen()) {
                        ObjectNode forwarded = objectMapper.createObjectNode();
                        forwarded.put("routeId", route.routeId());
                        forwarded.put("transferId", transferId);
                        forwarded.put("reason", reason);
                        sendCommand(peer, CMD_P2P_TRANSFER_CANCEL, null, forwarded);
                    }
                }
                notifyP2pTransferUnavailable(source.recipientId(), transferId, null);
            } else {
                throw new BusinessException(400, "routeId or transferId is required");
            }
            ObjectNode response = objectMapper.createObjectNode();
            response.put("ok", true);
            if (!routeId.isBlank()) response.put("routeId", routeId);
            if (!transferId.isBlank()) response.put("transferId", transferId);
            sendCommand(session, CMD_P2P_TRANSFER_CANCEL, seq, response);
        } catch (BusinessException e) {
            sendP2pError(session, CMD_P2P_TRANSFER_CANCEL, seq, e);
        }
    }

    /**
     * 已读标记：客户端打开/滚动会话时上报，更新该用户在该会话中的 lastReadMessageId。
     */
    private void handleMessageRead(Long userId, JsonNode root) {
        JsonNode data = root.get("data");
        Long conversationId = data != null && data.has("conversationId") ? data.get("conversationId").asLong() : null;
        Long lastReadMessageId = data != null && data.has("lastReadMessageId") ? data.get("lastReadMessageId").asLong() : null;
        if (conversationId == null) {
            return;
        }
        messageService.markConversationRead(userId, conversationId, lastReadMessageId);
    }

    /**
     * 消息推送：查询会话成员列表，向除发送方外的所有在线成员推送 MESSAGE_RECEIVE。
     * 推送内容包含完整消息体（含发送者昵称/头像/签名），避免客户端额外查询。
     */
    private void pushMessageToConversationMembers(Long conversationId, Long senderId, ImMessage msg) {
        try {
            // 查询会话成员列表
            LambdaQueryWrapper<ImConversationMember> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(ImConversationMember::getConversationId, conversationId);
            List<ImConversationMember> members = conversationMemberMapper.selectList(wrapper);
            List<Long> memberIds = members.stream()
                    .map(ImConversationMember::getUserId)
                    .collect(Collectors.toList());

            // 构建 MESSAGE_RECEIVE 推送消息，包含发送者信息避免客户端额外查询
            ObjectNode receiveMsg = objectMapper.createObjectNode();
            receiveMsg.put("cmd", CMD_MESSAGE_RECEIVE);
            ObjectNode receiveData = receiveMsg.putObject("data");
            receiveData.put("messageId", msg.getId());
            receiveData.put("conversationId", conversationId);
            receiveData.put("senderId", senderId);
            SysUser sender = userMapper.selectById(senderId);
            receiveData.put("senderName", sender != null ? sender.getNickname() : "");
            receiveData.put("senderAvatar", sender != null ? sender.getAvatar() : "");
            receiveData.put("senderSignature", sender != null ? sender.getSignature() : "");
            receiveData.put("messageType", msg.getMessageType());
            receiveData.put("content", msg.getContent());
            receiveData.put("clientMsgId", msg.getClientMsgId());
            receiveData.put("status", msg.getStatus());
            receiveData.put("createdAt", msg.getCreateTime() != null ? msg.getCreateTime().toString() : null);
            receiveData.put("timestamp", System.currentTimeMillis());

            String messageJson = objectMapper.writeValueAsString(receiveMsg);

            // 推送给会话中除发送方外的所有在线成员
            for (Long memberId : memberIds) {
                if (!memberId.equals(senderId) && sessionManager.isOnline(memberId)) {
                    sessionManager.sendToUser(memberId, messageJson);
                }
            }
        } catch (Exception e) {
            log.error("Error pushing message to conversation members: conversationId={}", conversationId, e);
        }
    }

    /**
     * 在线状态处理：支持三种模式——
     * 1) 指定 conversationId → 返回该会话所有成员状态；
     * 2) 指定 targetUserId → 返回该用户状态（含隐身可见性）；
     * 3) 仅传 status → 更新自己的在线状态并广播变更。
     */
    private void handleOnlineStatus(WebSocketSession session, Long userId, JsonNode root, String seq) {
        try {
            JsonNode data = root.get("data");
            // 如果传了 status，则更新自己的在线状态并广播变更
            String nextStatus = data != null && data.has("status") ? normalizePresenceStatus(data.get("status").asText()) : null;
            if (nextStatus != null && !PRESENCE_OFFLINE.equals(nextStatus)) {
                redisTemplate.opsForValue().set(REDIS_PRESENCE_PREFIX + userId, nextStatus);
                notifyOnlineStatusChange(userId, nextStatus);
            }
            Long targetUserId = data != null && data.has("userId") ? data.get("userId").asLong() : null;
            Long queryConversationId = data != null && data.has("conversationId") ? data.get("conversationId").asLong() : null;

            ObjectNode response = objectMapper.createObjectNode();
            response.put("cmd", CMD_ONLINE_STATUS);
            if (seq != null) {
                response.put("seq", seq);
            }
            ObjectNode statusData = response.putObject("data");

            if (queryConversationId != null) {
                // 模式1：查询会话中所有其他成员的状态
                LambdaQueryWrapper<ImConversationMember> wrapper = new LambdaQueryWrapper<>();
                wrapper.eq(ImConversationMember::getConversationId, queryConversationId);
                List<ImConversationMember> members = conversationMemberMapper.selectList(wrapper);
                for (ImConversationMember member : members) {
                    if (!member.getUserId().equals(userId)) {
                        ObjectNode memberStatus = statusData.putObject(String.valueOf(member.getUserId()));
                        putPresencePayload(memberStatus, member.getUserId(), false); // 非自己，遵守隐身
                    }
                }
            } else if (targetUserId != null) {
                // 模式2：查询指定用户的状态
                ObjectNode memberStatus = statusData.putObject(String.valueOf(targetUserId));
                putPresencePayload(memberStatus, targetUserId, targetUserId.equals(userId)); // 查自己时不受隐身影响
            } else if (nextStatus != null) {
                // 模式3：仅更新自己的状态，返回确认
                statusData.put("userId", userId);
                putPresencePayload(statusData, userId, true);
            }

            sessionManager.sendToUser(userId, objectMapper.writeValueAsString(response));
        } catch (Exception e) {
            log.error("Error handling ONLINE_STATUS from userId={}", userId, e);
        }
    }

    /**
     * 在线状态变更通知：当用户上线/离线/改变状态时，通过会话成员关系找到所有有共同会话的在线联系人，
     * 向他们推送 ONLINE_STATUS 消息。遵循隐身可见性规则。
     */
    private void notifyOnlineStatusChange(Long userId, String status) {
        try {
            // 1. 查询该用户参与的所有会话
            LambdaQueryWrapper<ImConversationMember> convWrapper = new LambdaQueryWrapper<>();
            convWrapper.eq(ImConversationMember::getUserId, userId);
            List<ImConversationMember> userMemberships = conversationMemberMapper.selectList(convWrapper);
            List<Long> conversationIds = userMemberships.stream()
                    .map(ImConversationMember::getConversationId)
                    .distinct()
                    .collect(Collectors.toList());

            if (conversationIds.isEmpty()) {
                return;
            }

            // 2. 查询这些会话中的所有成员（去重），即需要通知的联系人
            LambdaQueryWrapper<ImConversationMember> contactWrapper = new LambdaQueryWrapper<>();
            contactWrapper.in(ImConversationMember::getConversationId, conversationIds);
            List<ImConversationMember> allMembers = conversationMemberMapper.selectList(contactWrapper);
            List<Long> contactIds = allMembers.stream()
                    .map(ImConversationMember::getUserId)
                    .filter(id -> !id.equals(userId)) // 排除自己
                    .distinct()
                    .collect(Collectors.toList());

            // 3. 构建状态变更消息，非本人视角遵守隐身可见性
            ObjectNode statusMsg = objectMapper.createObjectNode();
            statusMsg.put("cmd", CMD_ONLINE_STATUS);
            ObjectNode statusData = statusMsg.putObject("data");
            statusData.put("userId", userId);
            String visibleStatus = visiblePresenceStatus(userId, false, status);
            statusData.put("status", visibleStatus);
            statusData.put("online", !PRESENCE_OFFLINE.equals(visibleStatus));

            String messageJson = objectMapper.writeValueAsString(statusMsg);

            // 4. 推送给所有在线的联系人
            for (Long contactId : contactIds) {
                if (sessionManager.isOnline(contactId)) {
                    sessionManager.sendToUser(contactId, messageJson);
                }
            }
        } catch (Exception e) {
            log.error("Error notifying online status change for userId={}", userId, e);
        }
    }

    private void notifyP2pCapabilityChange(Long userId) {
        if (!p2pProperties.isEnabled()) {
            return;
        }
        try {
            List<ImConversationMember> memberships = conversationMemberMapper.selectList(
                    new LambdaQueryWrapper<ImConversationMember>()
                            .eq(ImConversationMember::getUserId, userId));
            for (ImConversationMember membership : memberships) {
                ImConversation conversation = conversationMapper.selectById(membership.getConversationId());
                if (conversation == null || conversation.getType() == null || conversation.getType() != 1) {
                    continue;
                }
                List<ImConversationMember> members = conversationMemberMapper.selectList(
                        new LambdaQueryWrapper<ImConversationMember>()
                                .eq(ImConversationMember::getConversationId, conversation.getId()));
                ObjectNode data = objectMapper.createObjectNode();
                data.put("conversationId", conversation.getId());
                data.put("userId", userId);
                data.put("available", p2pRegistry.hasCapableSession(userId));
                for (ImConversationMember member : members) {
                    if (!member.getUserId().equals(userId)) {
                        for (WebSocketSession target : sessionManager.getSessions(member.getUserId())) {
                            sendCommand(target, CMD_P2P_PEER_STATUS, null, data);
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to publish P2P capability change for userId={}", userId);
        }
    }

    private void notifyP2pTransferClaim(Long receiverId, String transferId, boolean claimed,
                                        WebSocketSession excludedSession) {
        for (WebSocketSession target : p2pRegistry.getCapableSessions(receiverId)) {
            if (excludedSession != null && target.getId().equals(excludedSession.getId())) {
                continue;
            }
            ObjectNode data = objectMapper.createObjectNode();
            data.put("transferId", transferId);
            data.put("claimed", claimed);
            sendCommand(target, CMD_P2P_TRANSFER_CLAIMED, null, data);
        }
    }

    private void notifyP2pTransferUnavailable(Long receiverId, String transferId,
                                              WebSocketSession alreadyNotifiedSession) {
        for (WebSocketSession target : p2pRegistry.getCapableSessions(receiverId)) {
            if (alreadyNotifiedSession != null && target.getId().equals(alreadyNotifiedSession.getId())) {
                continue;
            }
            ObjectNode data = objectMapper.createObjectNode();
            data.put("transferId", transferId);
            data.put("reason", "source_cancelled");
            sendCommand(target, CMD_P2P_TRANSFER_CANCEL, null, data);
        }
    }

    private Long directPeer(Long conversationId, Long userId) {
        ImConversation conversation = conversationMapper.selectById(conversationId);
        if (conversation == null || conversation.getType() == null || conversation.getType() != 1) {
            throw new BusinessException(400, "P2P attachments are only supported in direct conversations");
        }
        List<ImConversationMember> members = conversationMemberMapper.selectList(
                new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, conversationId));
        if (members.size() != 2) {
            throw new BusinessException(409, "Direct conversation must contain exactly two members");
        }
        boolean member = members.stream().anyMatch(item -> item.getUserId().equals(userId));
        if (!member) {
            throw new BusinessException(403, "Not a member of this conversation");
        }
        return members.stream()
                .map(ImConversationMember::getUserId)
                .filter(id -> !id.equals(userId))
                .findFirst()
                .orElseThrow(() -> new BusinessException(409, "Direct conversation has no peer"));
    }

    private void validateP2pLimits(String kind, long totalSize, int fileCount) {
        if (totalSize <= 0 || fileCount <= 0) {
            throw new BusinessException(400, "P2P attachment is empty");
        }
        if ("file".equals(kind)) {
            if (fileCount != 1 || totalSize > p2pProperties.getMaxFileSize()) {
                throw new BusinessException(413, "P2P file exceeds the size limit");
            }
            return;
        }
        if (fileCount > p2pProperties.getMaxFolderFiles()
                || totalSize > p2pProperties.getMaxFolderSize()) {
            throw new BusinessException(413, "P2P folder exceeds the transfer limit");
        }
    }

    private void validateP2pSignal(P2pTransferRegistry.Route route, WebSocketSession session,
                                   JsonNode signal) {
        if (signal.size() != 1) {
            throw new BusinessException(400, "P2P signal must contain exactly one payload");
        }
        if (signal.has("description")) {
            JsonNode description = signal.get("description");
            String type = description != null ? description.path("type").asText("") : "";
            String expectedType = "source".equals(route.roleOf(session)) ? "offer" : "answer";
            if (description == null || !description.isObject()
                    || !expectedType.equals(type) || !description.path("sdp").isTextual()
                    || !hasOnlyFields(description, Set.of("type", "sdp"))) {
                throw new BusinessException(400, "Invalid P2P session description");
            }
            return;
        }
        if (signal.has("candidate")) {
            JsonNode candidate = signal.get("candidate");
            if (candidate == null || !candidate.isObject() || !candidate.path("candidate").isTextual()
                    || !hasOnlyFields(candidate,
                    Set.of("candidate", "sdpMid", "sdpMLineIndex", "usernameFragment"))) {
                throw new BusinessException(400, "Invalid P2P ICE candidate");
            }
            return;
        }
        if (signal.has("control")) {
            JsonNode control = signal.get("control");
            if (!"source".equals(route.roleOf(session)) || control == null || !control.isObject()
                    || !"queued".equals(control.path("type").asText())
                    || !hasOnlyFields(control, Set.of("type"))) {
                throw new BusinessException(400, "Invalid P2P control signal");
            }
            return;
        }
        throw new BusinessException(400, "Unsupported P2P signal payload");
    }

    private boolean hasOnlyFields(JsonNode object, Set<String> allowedFields) {
        Iterator<String> fields = object.fieldNames();
        while (fields.hasNext()) {
            if (!allowedFields.contains(fields.next())) {
                return false;
            }
        }
        return true;
    }

    private P2pMessageMetadata parseStoredP2pMessage(ImMessage message, Long senderId) {
        if (message == null || !senderId.equals(message.getSenderId())) {
            throw new BusinessException(404, "P2P attachment message not found");
        }
        try {
            JsonNode content = objectMapper.readTree(message.getContent());
            if (!"p2p_lan".equals(content.path("transferMode").asText())) {
                throw new BusinessException(400, "Message is not a P2P attachment");
            }
            String transferId = requiredText(content, "transferId");
            return new P2pMessageMetadata(transferId);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(400, "Invalid P2P attachment message");
        }
    }

    private void ensureP2pEnabled() {
        if (!p2pProperties.isEnabled()) {
            throw new BusinessException(503, "P2P file transfer is disabled");
        }
    }

    private JsonNode requiredObject(JsonNode root, String field) {
        JsonNode value = root != null ? root.get(field) : null;
        if (value == null || !value.isObject()) {
            throw new BusinessException(400, field + " is required");
        }
        return value;
    }

    private String requiredText(JsonNode root, String field) {
        String value = root != null ? root.path(field).asText("").trim() : "";
        if (value.isBlank()) {
            throw new BusinessException(400, field + " is required");
        }
        return value;
    }

    private Long requiredLong(JsonNode root, String field) {
        JsonNode value = root != null ? root.get(field) : null;
        if (value == null || !value.canConvertToLong()) {
            throw new BusinessException(400, field + " is required");
        }
        return value.asLong();
    }

    private void sendP2pError(WebSocketSession session, String command, String seq, BusinessException error) {
        ObjectNode response = objectMapper.createObjectNode();
        response.put("ok", false);
        response.put("code", error.getCode());
        response.put("message", error.getMessage());
        sendCommand(session, command, seq, response);
    }

    private void sendCommand(WebSocketSession session, String command, String seq, ObjectNode data) {
        try {
            ObjectNode response = objectMapper.createObjectNode();
            response.put("cmd", command);
            if (seq != null) {
                response.put("seq", seq);
            }
            response.set("data", data);
            sessionManager.sendToSession(session, objectMapper.writeValueAsString(response));
        } catch (Exception e) {
            log.warn("Failed to send WebSocket command {} to session={}", command, session.getId());
        }
    }

    private record P2pMessageMetadata(String transferId) {
    }

    /**
     * 向 JSON node 写入在线状态负载：status（可见状态）和 online 布尔值。
     *
     * @param self 是否本人视角，本人不受隐身规则影响
     */
    private void putPresencePayload(ObjectNode node, Long userId, boolean self) {
        String status = currentPresenceStatus(userId);
        String visibleStatus = visiblePresenceStatus(userId, self, status);
        node.put("status", visibleStatus);
        node.put("online", !PRESENCE_OFFLINE.equals(visibleStatus));
    }

    /**
     * 获取用户当前在线状态：若不在线返回 offline，否则从 Redis 读取并归一化。
     */
    private String currentPresenceStatus(Long userId) {
        if (!sessionManager.isOnline(userId)) {
            return PRESENCE_OFFLINE;
        }
        String stored = redisTemplate.opsForValue().get(REDIS_PRESENCE_PREFIX + userId);
        return normalizePresenceStatus(stored);
    }

    /**
     * 计算对外可见的在线状态：隐身用户对他人显示为 offline，对自己仍可见真实状态。
     */
    private String visiblePresenceStatus(Long userId, boolean self, String status) {
        String normalized = normalizePresenceStatus(status);
        if (!sessionManager.isOnline(userId) || PRESENCE_OFFLINE.equals(normalized)) {
            return PRESENCE_OFFLINE;
        }
        // 隐身状态对他人隐藏，显示为离线
        if (!self && PRESENCE_INVISIBLE.equals(normalized)) {
            return PRESENCE_OFFLINE;
        }
        return normalized;
    }

    /**
     * 状态值归一化：null/空/非法值默认映射为 online，合法值（busy/away/dnd/invisible/offline）原样返回。
     */
    private String normalizePresenceStatus(String status) {
        if (status == null || status.isBlank()) {
            return PRESENCE_ONLINE;
        }
        return switch (status) {
            case PRESENCE_BUSY, PRESENCE_AWAY, PRESENCE_DND, PRESENCE_INVISIBLE, PRESENCE_OFFLINE -> status;
            default -> PRESENCE_ONLINE;
        };
    }
}
