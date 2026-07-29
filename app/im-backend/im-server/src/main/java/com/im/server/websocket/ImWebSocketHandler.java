package com.im.server.websocket;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.im.common.dto.SendMessageRequest;
import com.im.common.entity.ImConversationMember;
import com.im.common.entity.ImMessage;
import com.im.common.entity.SysUser;
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

    private final StringRedisTemplate redisTemplate;
    private final MessageService messageService;
    private final ConversationMemberMapper conversationMemberMapper;
    private final UserMapper userMapper;
    private final WebSocketSessionManager sessionManager;
    private final ObjectMapper objectMapper;

    public ImWebSocketHandler(StringRedisTemplate redisTemplate,
                              MessageService messageService,
                              ConversationMemberMapper conversationMemberMapper,
                              UserMapper userMapper,
                              WebSocketSessionManager sessionManager,
                              ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.messageService = messageService;
        this.conversationMemberMapper = conversationMemberMapper;
        this.userMapper = userMapper;
        this.sessionManager = sessionManager;
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

        // removeSession 返回 true 表示这是该用户最后一个活跃 session
        if (!sessionManager.removeSession(userId, session)) {
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
