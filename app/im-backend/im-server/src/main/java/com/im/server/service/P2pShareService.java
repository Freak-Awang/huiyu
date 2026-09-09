package com.im.server.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.im.common.entity.ImMessage;
import com.im.common.entity.ImP2pShare;
import com.im.common.entity.ImConversationMember;
import com.im.common.exception.BusinessException;
import com.im.server.mapper.MessageMapper;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.P2pShareMapper;
import com.im.server.websocket.P2pTransferRegistry;
import com.im.server.websocket.WebSocketSessionManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.locks.ReentrantLock;

/** Persistent sharing authorization, never a file transport or file catalog. */
@Service
public class P2pShareService {
    private final P2pShareMapper shares;
    private final MessageMapper messages;
    private final P2pTransferRegistry registry;
    private final WebSocketSessionManager sessions;
    private final ObjectMapper json;
    private final ConversationMemberMapper members;

    public P2pShareService(P2pShareMapper shares, MessageMapper messages, P2pTransferRegistry registry,
                           WebSocketSessionManager sessions, ObjectMapper json, ConversationMemberMapper members) {
        this.shares = shares;
        this.messages = messages;
        this.registry = registry;
        this.sessions = sessions;
        this.json = json;
        this.members = members;
    }

    public Guard guardTransaction() {
        ReentrantLock lock = registry.controlLock();
        lock.lock();
        boolean transactional = TransactionSynchronizationManager.isSynchronizationActive();
        if (transactional) TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) { lock.unlock(); }
        });
        return new Guard(lock, transactional);
    }

    public record Guard(ReentrantLock lock, boolean transactional) implements AutoCloseable {
        @Override public void close() { if (!transactional) lock.unlock(); }
    }

    /** Called in the same transaction as message insertion, also for a deduplicated offer. */
    public ImP2pShare ensureShare(ImMessage message) {
        JsonNode metadata = metadata(message);
        String transferId = metadata.path("transferId").asText();
        ImP2pShare existing = shares.selectById(transferId);
        if (existing != null) {
            if (!existing.getMessageId().equals(message.getId())) throw new BusinessException(409, "TRANSFER_CONFLICT");
            return existing;
        }
        ImP2pShare share = new ImP2pShare();
        share.setTransferId(transferId);
        share.setMessageId(message.getId());
        share.setState("ACTIVE");
        share.setRevision(1L);
        share.setUpdatedAt(LocalDateTime.now());
        shares.insert(share);
        return share;
    }

    public ImP2pShare requireShare(String transferId) {
        ImP2pShare share = shares.selectById(transferId);
        if (share == null) throw new BusinessException(404, "SHARE_NOT_FOUND");
        return share;
    }

    public ImMessage requireMessage(ImP2pShare share) {
        ImMessage message = messages.selectById(share.getMessageId());
        if (message == null) throw new BusinessException(410, "SHARE_UNAVAILABLE");
        return message;
    }

    public ImP2pShare requireActive(String transferId) {
        ImP2pShare share = requireShare(transferId);
        if (!"ACTIVE".equals(share.getState())) throw new BusinessException(410, "SHARE_" + share.getState());
        metadata(requireMessage(share));
        return share;
    }

    public JsonNode metadata(ImMessage message) {
        if (message == null || "RECALLED".equals(message.getStatus())) throw new BusinessException(410, "SHARE_RECALLED");
        try {
            JsonNode metadata = json.readTree(message.getContent());
            if (metadata == null || !"p2p_lan".equals(metadata.path("transferMode").asText())
                    || !metadata.path("transferId").asText().matches("p2p_[A-Za-z0-9_-]{1,60}")) {
                throw new BusinessException(400, "Invalid P2P attachment message");
            }
            return metadata;
        } catch (BusinessException e) { throw e; }
        catch (Exception e) { throw new BusinessException(400, "Invalid P2P attachment message"); }
    }

    @Transactional
    public ImP2pShare stop(String transferId, Long userId) {
        try (Guard ignored = guardTransaction()) {
            ImP2pShare share = requireShare(transferId);
            ImMessage message = requireMessage(share);
            if (!userId.equals(message.getSenderId())) throw new BusinessException(403, "Only the sender can stop sharing");
            transition(share, "STOPPED", message);
            return share;
        }
    }

    /** Called before recall erases content, inside the recall transaction and control guard. */
    public void recall(ImMessage message) {
        ImP2pShare share = shares.selectOne(new LambdaQueryWrapper<ImP2pShare>()
                .eq(ImP2pShare::getMessageId, message.getId()));
        if (share != null) transition(share, "RECALLED", message);
    }

    private void transition(ImP2pShare share, String state, ImMessage message) {
        if (share.getState().equals(state) || "RECALLED".equals(share.getState())) return;
        share.setState(state);
        share.setRevision(share.getRevision() + 1);
        share.setUpdatedAt(LocalDateTime.now());
        shares.updateById(share);
        Runnable invalidate = () -> invalidate(share, message);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { invalidate.run(); }
            });
        } else invalidate.run();
    }

    private void invalidate(ImP2pShare share, ImMessage message) {
        String reason = "RECALLED".equals(share.getState()) ? "recalled" : "source_stopped";
        P2pTransferRegistry.SourceRegistration source = registry.getSource(share.getTransferId());
        var endedRoutes = registry.invalidateShare(share.getTransferId(), reason);
        Set<Long> users = new HashSet<>();
        if (message != null) {
            users.add(message.getSenderId());
            try {
                for (ImConversationMember member : members.selectList(new LambdaQueryWrapper<ImConversationMember>()
                        .eq(ImConversationMember::getConversationId, message.getConversationId()))) users.add(member.getUserId());
            } catch (RuntimeException ignored) { /* Existing route participants still receive invalidation. */ }
        }
        if (source != null) { users.add(source.senderId()); users.add(source.recipientId()); }
        for (P2pTransferRegistry.Route route : endedRoutes) {
            users.add(route.sourceUserId()); users.add(route.receiverUserId());
            ObjectNode data = json.createObjectNode();
            data.put("transferId", share.getTransferId()); data.put("routeId", route.routeId()); data.put("reason", reason);
            send(route.sourceUserId(), "P2P_TRANSFER_CANCEL", data);
            send(route.receiverUserId(), "P2P_TRANSFER_CANCEL", data);
        }
        ObjectNode data = json.createObjectNode();
        data.put("transferId", share.getTransferId()); data.put("messageId", share.getMessageId());
        data.put("shareState", share.getState()); data.put("revision", share.getRevision());
        for (Long user : users) send(user, "P2P_SHARE_STATE", data);
    }

    private void send(Long user, String command, ObjectNode data) {
        ObjectNode envelope = json.createObjectNode(); envelope.put("cmd", command); envelope.set("data", data);
        try { sessions.sendToUser(user, envelope.toString()); }
        catch (RuntimeException ignored) { /* Durable state is authoritative on reconnect. */ }
    }
}
