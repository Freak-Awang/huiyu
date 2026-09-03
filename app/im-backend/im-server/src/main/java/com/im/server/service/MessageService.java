package com.im.server.service;

import com.im.common.dto.MessageVO;
import com.im.common.dto.SendMessageRequest;
import com.im.common.entity.ImMessage;
import com.im.common.result.PageResult;

import java.util.List;
/**
 * 消息服务接口：定义消息收发、撤回、已读回执、离线消息拉取及消息清理等业务契约。
 */
public interface MessageService {

    /**
     * 分页查询会话历史消息。
     *
     * @param userId 查询用户 ID
     * @param conversationId 会话 ID
     * @param beforeMessageId 上一页最后一条消息 ID，用于向前翻页
     * @param pageSize 每页大小
     * @return 消息分页结果
     */
    PageResult<MessageVO> getMessages(Long userId, Long conversationId, Long beforeMessageId, int pageSize);

    /**
     * 搜索会话内消息。
     *
     * @param userId 查询用户 ID
     * @param conversationId 会话 ID
     * @param keyword 搜索关键词
     * @param pageSize 每页大小
     * @return 消息分页结果
     */
    PageResult<MessageVO> searchMessages(Long userId, Long conversationId, String keyword, int pageSize);

    /**
     * 发送消息。
     *
     * @param senderId 发送者 ID
     * @param request 发送请求
     * @return 消息实体
     */
    ImMessage sendMessage(Long senderId, SendMessageRequest request);

    /**
     * 由受鉴权的 WebSocket P2P offer 流程创建附件消息。
     * 普通消息接口不能直接伪造 {@code p2p_lan} 内容。
     */
    ImMessage sendP2pMessage(Long senderId, SendMessageRequest request);

    /**
     * 撤回消息（仅限发送者，且有时间窗口限制）。
     *
     * @param userId 操作用户 ID
     * @param messageId 消息 ID
     * @return 撤回后的消息视图
     */
    MessageVO recallMessage(Long userId, Long messageId);

    /**
     * 获取当前用户的离线待推送消息。
     *
     * @param userId 用户 ID
     * @param limit 最大条数
     * @return 待推送消息列表
     */
    List<MessageVO> getPendingMessages(Long userId, int limit);

    /**
     * 确认消息已送达（ACK）。
     *
     * @param userId 用户 ID
     * @param messageId 消息 ID
     */
    void acknowledgeMessage(Long userId, Long messageId);

    /**
     * 标记会话已读至指定消息。
     *
     * @param userId 用户 ID
     * @param conversationId 会话 ID
     * @param lastReadMessageId 最后已读消息 ID，null 表示读到最新
     */
    void markConversationRead(Long userId, Long conversationId, Long lastReadMessageId);

    /**
     * 清理过期消息（当前版本保留全部消息，方法保留用于兼容旧调度逻辑）。
     */
    void cleanupExpiredMessages();
}
