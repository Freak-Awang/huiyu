package com.im.server.controller;

import com.im.common.dto.MessageVO;
import com.im.common.result.Result;
import com.im.server.service.MessageService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 消息控制器。
 * <p>
 * 提供消息查询、搜索、待接收消息拉取、消息确认、
 * 消息撤回、会话已读标记等接口，
 * URL 前缀为 {@code /api/messages}。
 * </p>
 */
@RestController
@RequestMapping("/api/messages")
public class MessageController {

    @Autowired
    private MessageService messageService;

    /**
     * 分页查询会话消息。
     *
     * @param conversationId  会话 ID
     * @param beforeMessageId 上一页最后一条消息 ID（可选，用于分页）
     * @param pageSize        每页数量，默认 20
     * @return 消息分页数据
     */
    @GetMapping("/{conversationId}")
    public Result<com.im.common.result.PageResult<MessageVO>> getMessages(
            @PathVariable Long conversationId,
            @RequestParam(required = false) Long beforeMessageId,
            @RequestParam(defaultValue = "20") int pageSize) {
        Long userId = getCurrentUserId();
        return Result.success(messageService.getMessages(userId, conversationId, beforeMessageId, pageSize));
    }

    /**
     * 搜索会话消息。
     *
     * @param conversationId 会话 ID
     * @param keyword        搜索关键词
     * @param pageSize       每页数量，默认 20
     * @return 消息分页数据
     */
    @GetMapping("/{conversationId}/search")
    public Result<com.im.common.result.PageResult<MessageVO>> searchMessages(
            @PathVariable Long conversationId,
            @RequestParam String keyword,
            @RequestParam(defaultValue = "20") int pageSize) {
        Long userId = getCurrentUserId();
        return Result.success(messageService.searchMessages(userId, conversationId, keyword, pageSize));
    }

    /**
     * 拉取当前用户的待接收消息。
     *
     * @param limit 最大拉取数量，默认 100
     * @return 待接收消息列表
     */
    @GetMapping("/pending")
    public Result<List<MessageVO>> getPendingMessages(@RequestParam(defaultValue = "100") int limit) {
        Long userId = getCurrentUserId();
        return Result.success(messageService.getPendingMessages(userId, limit));
    }

    /**
     * 确认消息已接收。
     *
     * @param messageId 消息 ID
     * @return 操作结果
     */
    @PostMapping("/ack/{messageId}")
    public Result<Void> acknowledgeMessage(@PathVariable Long messageId) {
        Long userId = getCurrentUserId();
        messageService.acknowledgeMessage(userId, messageId);
        return Result.ok();
    }

    /**
     * 撤回消息。
     *
     * @param messageId 消息 ID
     * @return 撤回后的消息信息
     */
    @PostMapping("/recall/{messageId}")
    public Result<MessageVO> recallMessage(@PathVariable Long messageId) {
        Long userId = getCurrentUserId();
        return Result.success(messageService.recallMessage(userId, messageId));
    }

    /**
     * 标记会话已读。
     *
     * @param conversationId    会话 ID
     * @param lastReadMessageId 最后已读消息 ID（可选）
     * @return 操作结果
     */
    @PostMapping("/read/{conversationId}")
    public Result<Void> markRead(
            @PathVariable Long conversationId,
            @RequestParam(required = false) Long lastReadMessageId) {
        Long userId = getCurrentUserId();
        messageService.markConversationRead(userId, conversationId, lastReadMessageId);
        return Result.ok();
    }

    private Long getCurrentUserId() {
        String userIdStr = (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return Long.parseLong(userIdStr);
    }
}
