package com.im.server.controller;

import com.im.common.dto.ConversationVO;
import com.im.common.dto.ConversationMembersRequest;
import com.im.common.dto.CreateConversationRequest;
import com.im.common.result.Result;
import com.im.server.service.ConversationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/conversations")
public class ConversationController {

    @Autowired
    private ConversationService conversationService;

    @GetMapping
    public Result<List<ConversationVO>> listConversations() {
        Long userId = getCurrentUserId();
        return Result.success(conversationService.listConversations(userId));
    }

    @PostMapping
    public Result<ConversationVO> createConversation(@RequestBody CreateConversationRequest request) {
        Long userId = getCurrentUserId();
        return Result.success(conversationService.createConversation(userId, request));
    }

    @PostMapping("/{id}/members")
    public Result<Void> addMembers(@PathVariable("id") Long conversationId,
                                    @RequestBody ConversationMembersRequest request) {
        Long userId = getCurrentUserId();
        conversationService.addMembers(conversationId, request.getUserIds(), userId);
        return Result.ok();
    }

    @DeleteMapping("/{id}/members/{userId}")
    public Result<Void> removeMember(@PathVariable("id") Long conversationId,
                                      @PathVariable Long userId) {
        Long currentUserId = getCurrentUserId();
        conversationService.removeMember(conversationId, userId, currentUserId);
        return Result.ok();
    }

    @PutMapping("/{id}/pin")
    public Result<Void> pinConversation(@PathVariable("id") Long conversationId,
                                         @RequestParam boolean pinned) {
        Long userId = getCurrentUserId();
        conversationService.pinConversation(conversationId, userId, pinned);
        return Result.ok();
    }

    @PutMapping("/{id}/mute")
    public Result<Void> muteConversation(@PathVariable("id") Long conversationId,
                                         @RequestParam boolean muted) {
        Long userId = getCurrentUserId();
        conversationService.muteConversation(conversationId, userId, muted);
        return Result.ok();
    }

    @GetMapping("/{id}")
    public Result<ConversationVO> getConversation(@PathVariable("id") Long id) {
        Long userId = getCurrentUserId();
        return Result.success(conversationService.getById(id, userId));
    }

    private Long getCurrentUserId() {
        String userIdStr = (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return Long.parseLong(userIdStr);
    }
}
