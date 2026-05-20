package com.im.server.controller;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.im.common.dto.MessageVO;
import com.im.common.entity.ImConversationMember;
import com.im.common.result.Result;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.service.MessageService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/messages")
public class MessageController {

    @Autowired
    private MessageService messageService;

    @Autowired
    private ConversationMemberMapper conversationMemberMapper;

    @GetMapping("/{conversationId}")
    public Result<com.im.common.result.PageResult<MessageVO>> getMessages(
            @PathVariable Long conversationId,
            @RequestParam(required = false) Long beforeMessageId,
            @RequestParam(defaultValue = "20") int pageSize) {
        return Result.success(messageService.getMessages(conversationId, beforeMessageId, pageSize));
    }

    @PostMapping("/read/{conversationId}")
    public Result<Void> markRead(@PathVariable Long conversationId) {
        Long userId = getCurrentUserId();
        LambdaUpdateWrapper<ImConversationMember> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId)
                .set(ImConversationMember::getLastReadTime, LocalDateTime.now());
        conversationMemberMapper.update(null, wrapper);
        return Result.ok();
    }

    private Long getCurrentUserId() {
        String userIdStr = (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return Long.parseLong(userIdStr);
    }
}
