package com.im.server.websocket;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.im.common.dto.SendMessageRequest;
import com.im.common.entity.ImConversationMember;
import com.im.common.entity.ImMessage;
import com.im.common.entity.SysUser;
import com.im.common.util.JwtUtil;
import com.im.server.mapper.ConversationMemberMapper;
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

import java.util.List;
import java.util.stream.Collectors;

@Component
public class ImWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(ImWebSocketHandler.class);

    private static final String REDIS_ONLINE_PREFIX = "online:";
    private static final String REDIS_PRESENCE_PREFIX = "presence:";
    private static final String PRESENCE_ONLINE = "online";
    private static final String PRESENCE_BUSY = "busy";
    private static final String PRESENCE_AWAY = "away";
    private static final String PRESENCE_DND = "dnd";
    private static final String PRESENCE_INVISIBLE = "invisible";
    private static final String PRESENCE_OFFLINE = "offline";
    private static final String CMD_PING = "PING";
    private static final String CMD_PONG = "PONG";
    private static final String CMD_MESSAGE_SEND = "MESSAGE_SEND";
    private static final String CMD_MESSAGE_ACK = "MESSAGE_ACK";
    private static final String CMD_MESSAGE_RECEIVE = "MESSAGE_RECEIVE";
    private static final String CMD_MESSAGE_READ = "MESSAGE_READ";
    private static final String CMD_ONLINE_STATUS = "ONLINE_STATUS";
    private static final String CMD_FILE_P2P_INVITE = "FILE_P2P_INVITE";
    private static final String CMD_FILE_P2P_ACCEPT = "FILE_P2P_ACCEPT";
    private static final String CMD_FILE_P2P_REJECT = "FILE_P2P_REJECT";
    private static final String CMD_FILE_P2P_SIGNAL = "FILE_P2P_SIGNAL";
    private static final String CMD_FILE_P2P_PROGRESS = "FILE_P2P_PROGRESS";
    private static final String CMD_FILE_P2P_COMPLETE = "FILE_P2P_COMPLETE";
    private static final String CMD_FILE_P2P_FAILED = "FILE_P2P_FAILED";

    private final JwtUtil jwtUtil;
    private final StringRedisTemplate redisTemplate;
    private final MessageService messageService;
    private final ConversationMemberMapper conversationMemberMapper;
    private final UserMapper userMapper;
    private final WebSocketSessionManager sessionManager;
    private final ObjectMapper objectMapper;

    public ImWebSocketHandler(JwtUtil jwtUtil,
                              StringRedisTemplate redisTemplate,
                              MessageService messageService,
                              ConversationMemberMapper conversationMemberMapper,
                              UserMapper userMapper,
                              WebSocketSessionManager sessionManager,
                              ObjectMapper objectMapper) {
        this.jwtUtil = jwtUtil;
        this.redisTemplate = redisTemplate;
        this.messageService = messageService;
        this.conversationMemberMapper = conversationMemberMapper;
        this.userMapper = userMapper;
        this.sessionManager = sessionManager;
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
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
        redisTemplate.opsForValue().set(REDIS_ONLINE_PREFIX + userId, "1");
        redisTemplate.opsForValue().set(REDIS_PRESENCE_PREFIX + userId, PRESENCE_ONLINE);
        log.info("User {} connected, session={}", userId, session.getId());

        notifyOnlineStatusChange(userId, PRESENCE_ONLINE);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        Long senderId = (Long) session.getAttributes().get("userId");
        if (senderId == null) {
            return;
        }

        String payload = message.getPayload();
        try {
            JsonNode root = objectMapper.readTree(payload);
            String cmd = root.has("cmd") ? root.get("cmd").asText() : null;
            String seq = root.has("seq") ? root.get("seq").asText() : null;

            if (cmd == null) {
                return;
            }

            switch (cmd) {
                case CMD_PING:
                    handlePing(session, seq);
                    break;
                case CMD_MESSAGE_SEND:
                    handleMessageSend(session, senderId, root, seq);
                    break;
                case CMD_MESSAGE_ACK:
                    handleMessageAck(senderId, root);
                    break;
                case CMD_MESSAGE_READ:
                    handleMessageRead(senderId, root);
                    break;
                case CMD_ONLINE_STATUS:
                    handleOnlineStatus(session, senderId, root, seq);
                    break;
                case CMD_FILE_P2P_INVITE:
                case CMD_FILE_P2P_ACCEPT:
                case CMD_FILE_P2P_REJECT:
                case CMD_FILE_P2P_SIGNAL:
                case CMD_FILE_P2P_PROGRESS:
                case CMD_FILE_P2P_COMPLETE:
                case CMD_FILE_P2P_FAILED:
                    handleFileP2pRelay(senderId, cmd, root);
                    break;
                default:
                    log.debug("Unknown command: {}", cmd);
            }
        } catch (Exception e) {
            log.error("Error handling message from userId={}: {}", senderId, e.getMessage(), e);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        handleDisconnect(session);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("Transport error for session={}: {}", session.getId(), exception.getMessage());
        handleDisconnect(session);
    }

    private void handleDisconnect(WebSocketSession session) {
        Long userId = (Long) session.getAttributes().get("userId");
        if (userId == null) {
            return;
        }

        sessionManager.removeSession(userId);
        redisTemplate.delete(REDIS_ONLINE_PREFIX + userId);
        redisTemplate.delete(REDIS_PRESENCE_PREFIX + userId);
        log.info("User {} disconnected, session={}", userId, session.getId());

        notifyOnlineStatusChange(userId, PRESENCE_OFFLINE);
    }

    private void handlePing(WebSocketSession session, String seq) {
        try {
            ObjectNode response = objectMapper.createObjectNode();
            response.put("cmd", CMD_PONG);
            if (seq != null) {
                response.put("seq", seq);
            }
            sessionManager.sendToUser((Long) session.getAttributes().get("userId"),
                    objectMapper.writeValueAsString(response));
        } catch (Exception e) {
            log.error("Error sending PONG", e);
        }
    }

    private void handleMessageSend(WebSocketSession session, Long senderId, JsonNode root, String seq) {
        try {
            JsonNode data = root.get("data");
            if (data == null) {
                return;
            }

            Long conversationId = data.has("conversationId") ? data.get("conversationId").asLong() : null;
            String messageType = data.has("messageType") ? data.get("messageType").asText() : "TEXT";
            String content = data.has("content") ? data.get("content").asText() : null;
            String clientMsgId = data.has("clientMsgId") ? data.get("clientMsgId").asText() : null;

            if (conversationId == null || content == null) {
                log.warn("Invalid MESSAGE_SEND data: conversationId={}, content={}", conversationId, content);
                return;
            }

            SendMessageRequest request = new SendMessageRequest();
            request.setConversationId(conversationId);
            request.setMessageType(messageType);
            request.setContent(content);
            request.setClientMsgId(clientMsgId);

            ImMessage msg = messageService.sendMessage(senderId, request);

            sendAck(session, seq, msg, clientMsgId);

            pushMessageToConversationMembers(conversationId, senderId, msg);

        } catch (Exception e) {
            log.error("Error processing MESSAGE_SEND from userId={}", senderId, e);
        }
    }

    private void sendAck(WebSocketSession session, String seq, ImMessage msg, String clientMsgId) {
        try {
            ObjectNode ack = objectMapper.createObjectNode();
            ack.put("cmd", CMD_MESSAGE_ACK);
            if (seq != null) {
                ack.put("seq", seq);
            }
            ObjectNode ackData = ack.putObject("data");
            ackData.put("messageId", msg.getId());
            if (clientMsgId != null) {
                ackData.put("clientMsgId", clientMsgId);
            }
            ackData.put("status", "SENT");
            ackData.put("timestamp", System.currentTimeMillis());

            sessionManager.sendToUser((Long) session.getAttributes().get("userId"),
                    objectMapper.writeValueAsString(ack));
        } catch (Exception e) {
            log.error("Error sending ACK for messageId={}", msg.getId(), e);
        }
    }

    private void handleMessageAck(Long userId, JsonNode root) {
        JsonNode data = root.get("data");
        Long messageId = data != null && data.has("messageId") ? data.get("messageId").asLong() : null;
        if (messageId == null) {
            return;
        }
        messageService.acknowledgeMessage(userId, messageId);
    }

    private void handleMessageRead(Long userId, JsonNode root) {
        JsonNode data = root.get("data");
        Long conversationId = data != null && data.has("conversationId") ? data.get("conversationId").asLong() : null;
        Long lastReadMessageId = data != null && data.has("lastReadMessageId") ? data.get("lastReadMessageId").asLong() : null;
        if (conversationId == null) {
            return;
        }
        messageService.markConversationRead(userId, conversationId, lastReadMessageId);
    }

    private void pushMessageToConversationMembers(Long conversationId, Long senderId, ImMessage msg) {
        try {
            LambdaQueryWrapper<ImConversationMember> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(ImConversationMember::getConversationId, conversationId);
            List<ImConversationMember> members = conversationMemberMapper.selectList(wrapper);
            List<Long> memberIds = members.stream()
                    .map(ImConversationMember::getUserId)
                    .collect(Collectors.toList());

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

            for (Long memberId : memberIds) {
                if (!memberId.equals(senderId) && sessionManager.isOnline(memberId)) {
                    sessionManager.sendToUser(memberId, messageJson);
                }
            }
        } catch (Exception e) {
            log.error("Error pushing message to conversation members: conversationId={}", conversationId, e);
        }
    }

    private void handleOnlineStatus(WebSocketSession session, Long userId, JsonNode root, String seq) {
        try {
            JsonNode data = root.get("data");
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
                LambdaQueryWrapper<ImConversationMember> wrapper = new LambdaQueryWrapper<>();
                wrapper.eq(ImConversationMember::getConversationId, queryConversationId);
                List<ImConversationMember> members = conversationMemberMapper.selectList(wrapper);
                for (ImConversationMember member : members) {
                    if (!member.getUserId().equals(userId)) {
                        ObjectNode memberStatus = statusData.putObject(String.valueOf(member.getUserId()));
                        putPresencePayload(memberStatus, member.getUserId(), false);
                    }
                }
            } else if (targetUserId != null) {
                ObjectNode memberStatus = statusData.putObject(String.valueOf(targetUserId));
                putPresencePayload(memberStatus, targetUserId, targetUserId.equals(userId));
            } else if (nextStatus != null) {
                statusData.put("userId", userId);
                putPresencePayload(statusData, userId, true);
            }

            sessionManager.sendToUser(userId, objectMapper.writeValueAsString(response));
        } catch (Exception e) {
            log.error("Error handling ONLINE_STATUS from userId={}", userId, e);
        }
    }

    private void handleFileP2pRelay(Long senderId, String cmd, JsonNode root) {
        try {
            JsonNode data = root.get("data");
            if (data == null || !data.has("conversationId") || !data.has("targetUserId")) {
                return;
            }
            Long conversationId = data.get("conversationId").asLong();
            Long targetUserId = data.get("targetUserId").asLong();
            if (targetUserId.equals(senderId) || !isConversationMember(conversationId, senderId)
                    || !isConversationMember(conversationId, targetUserId)) {
                return;
            }
            if (!sessionManager.isOnline(targetUserId)) {
                return;
            }

            ObjectNode relay = objectMapper.createObjectNode();
            relay.put("cmd", cmd);
            ObjectNode relayData = data.deepCopy();
            relayData.put("senderId", senderId);
            relayData.put("timestamp", System.currentTimeMillis());
            relay.set("data", relayData);
            sessionManager.sendToUser(targetUserId, objectMapper.writeValueAsString(relay));
        } catch (Exception e) {
            log.error("Error relaying {} from userId={}", cmd, senderId, e);
        }
    }

    private boolean isConversationMember(Long conversationId, Long userId) {
        return conversationMemberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId)) != null;
    }

    private void notifyOnlineStatusChange(Long userId, String status) {
        try {
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

            LambdaQueryWrapper<ImConversationMember> contactWrapper = new LambdaQueryWrapper<>();
            contactWrapper.in(ImConversationMember::getConversationId, conversationIds);
            List<ImConversationMember> allMembers = conversationMemberMapper.selectList(contactWrapper);
            List<Long> contactIds = allMembers.stream()
                    .map(ImConversationMember::getUserId)
                    .filter(id -> !id.equals(userId))
                    .distinct()
                    .collect(Collectors.toList());

            ObjectNode statusMsg = objectMapper.createObjectNode();
            statusMsg.put("cmd", CMD_ONLINE_STATUS);
            ObjectNode statusData = statusMsg.putObject("data");
            statusData.put("userId", userId);
            String visibleStatus = visiblePresenceStatus(userId, false, status);
            statusData.put("status", visibleStatus);
            statusData.put("online", !PRESENCE_OFFLINE.equals(visibleStatus));

            String messageJson = objectMapper.writeValueAsString(statusMsg);

            for (Long contactId : contactIds) {
                if (sessionManager.isOnline(contactId)) {
                    sessionManager.sendToUser(contactId, messageJson);
                }
            }
        } catch (Exception e) {
            log.error("Error notifying online status change for userId={}", userId, e);
        }
    }

    private void putPresencePayload(ObjectNode node, Long userId, boolean self) {
        String status = currentPresenceStatus(userId);
        String visibleStatus = visiblePresenceStatus(userId, self, status);
        node.put("status", visibleStatus);
        node.put("online", !PRESENCE_OFFLINE.equals(visibleStatus));
    }

    private String currentPresenceStatus(Long userId) {
        if (!sessionManager.isOnline(userId)) {
            return PRESENCE_OFFLINE;
        }
        String stored = redisTemplate.opsForValue().get(REDIS_PRESENCE_PREFIX + userId);
        return normalizePresenceStatus(stored);
    }

    private String visiblePresenceStatus(Long userId, boolean self, String status) {
        String normalized = normalizePresenceStatus(status);
        if (!sessionManager.isOnline(userId) || PRESENCE_OFFLINE.equals(normalized)) {
            return PRESENCE_OFFLINE;
        }
        if (!self && PRESENCE_INVISIBLE.equals(normalized)) {
            return PRESENCE_OFFLINE;
        }
        return normalized;
    }

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
