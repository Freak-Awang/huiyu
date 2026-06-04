package com.im.server.controller;

import com.im.common.dto.ConversationVO;
import com.im.common.dto.ConversationMembersRequest;
import com.im.common.dto.CreateConversationRequest;
import com.im.common.dto.FileVO;
import com.im.common.dto.UpdateConversationSettingsRequest;
import com.im.common.dto.UpdateMemberRoleRequest;
import com.im.common.result.PageResult;
import com.im.common.result.Result;
import com.im.server.service.ConversationService;
import com.im.server.service.FileService;
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

    @Autowired
    private FileService fileService;

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

    @PutMapping("/{id}/settings")
    public Result<ConversationVO> updateSettings(@PathVariable("id") Long conversationId,
                                                  @RequestBody UpdateConversationSettingsRequest request) {
        Long userId = getCurrentUserId();
        return Result.success(conversationService.updateSettings(conversationId, userId, request));
    }

    @PutMapping("/{id}/members/{userId}/role")
    public Result<ConversationVO> updateMemberRole(@PathVariable("id") Long conversationId,
                                                   @PathVariable Long userId,
                                                   @RequestBody UpdateMemberRoleRequest request) {
        Long currentUserId = getCurrentUserId();
        return Result.success(conversationService.updateMemberRole(conversationId, userId, currentUserId, request));
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

    @GetMapping("/{id}/files")
    public Result<PageResult<FileVO>> listFiles(@PathVariable("id") Long conversationId,
                                                @RequestParam(defaultValue = "all") String type,
                                                @RequestParam(required = false) String keyword,
                                                @RequestParam(defaultValue = "1") int page,
                                                @RequestParam(defaultValue = "20") int pageSize) {
        Long userId = getCurrentUserId();
        return Result.success(fileService.listConversationFiles(userId, conversationId, type, keyword, page, pageSize));
    }

    private Long getCurrentUserId() {
        String userIdStr = (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return Long.parseLong(userIdStr);
    }
}
