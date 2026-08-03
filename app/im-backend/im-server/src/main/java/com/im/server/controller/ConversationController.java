package com.im.server.controller;

import com.im.common.dto.ConversationVO;
import com.im.common.dto.ConversationMembersRequest;
import com.im.common.dto.CreateConversationRequest;
import com.im.common.dto.TransferConversationOwnerRequest;
import com.im.common.dto.UpdateConversationSettingsRequest;
import com.im.common.dto.UpdateMemberRoleRequest;
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
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * 会话控制器。
 * <p>
 * 提供单聊/群聊会话的创建、查询、成员管理、设置更新、
 * 头像管理、群主转让、置顶/免打扰等接口，
 * URL 前缀为 {@code /api/conversations}。
 * </p>
 */
@RestController
@RequestMapping("/api/conversations")
public class ConversationController {

    @Autowired
    private ConversationService conversationService;

    /**
     * 查询当前用户的会话列表。
     *
     * @return 会话列表
     */
    @GetMapping
    public Result<List<ConversationVO>> listConversations() {
        Long userId = getCurrentUserId();
        return Result.success(conversationService.listConversations(userId));
    }

    /**
     * 创建会话（单聊或群聊）。
     *
     * @param request 创建会话请求
     * @return 创建后的会话信息
     */
    @PostMapping
    public Result<ConversationVO> createConversation(@RequestBody CreateConversationRequest request) {
        Long userId = getCurrentUserId();
        return Result.success(conversationService.createConversation(userId, request));
    }

    /**
     * 向会话中添加成员。
     *
     * @param conversationId 会话 ID
     * @param request        成员 ID 列表请求
     * @return 操作结果
     */
    @PostMapping("/{id}/members")
    public Result<Void> addMembers(@PathVariable("id") Long conversationId,
                                    @RequestBody ConversationMembersRequest request) {
        Long userId = getCurrentUserId();
        conversationService.addMembers(conversationId, request.getUserIds(), userId);
        return Result.ok();
    }

    /**
     * 从会话中移除成员。
     *
     * @param conversationId 会话 ID
     * @param userId         被移除的用户 ID
     * @return 操作结果
     */
    @DeleteMapping("/{id}/members/{userId}")
    public Result<Void> removeMember(@PathVariable("id") Long conversationId,
                                      @PathVariable Long userId) {
        Long currentUserId = getCurrentUserId();
        conversationService.removeMember(conversationId, userId, currentUserId);
        return Result.ok();
    }

    /**
     * 更新会话设置。
     *
     * @param conversationId 会话 ID
     * @param request        会话设置请求
     * @return 更新后的会话信息
     */
    @RequestMapping(value = {"/{id}/settings", "/{id}/settings/"}, method = {RequestMethod.PUT, RequestMethod.POST})
    public Result<ConversationVO> updateSettings(@PathVariable("id") Long conversationId,
                                                  @RequestBody UpdateConversationSettingsRequest request) {
        Long userId = getCurrentUserId();
        return Result.success(conversationService.updateSettings(conversationId, userId, request));
    }

    /**
     * 更新会话成员角色。
     *
     * @param conversationId 会话 ID
     * @param userId         目标用户 ID
     * @param request        角色更新请求
     * @return 更新后的会话信息
     */
    @RequestMapping(value = {"/{id}/members/{userId}/role", "/{id}/members/{userId}/role/"}, method = {RequestMethod.PUT, RequestMethod.POST})
    public Result<ConversationVO> updateMemberRole(@PathVariable("id") Long conversationId,
                                                   @PathVariable Long userId,
                                                   @RequestBody UpdateMemberRoleRequest request) {
        Long currentUserId = getCurrentUserId();
        return Result.success(conversationService.updateMemberRole(conversationId, userId, currentUserId, request));
    }

    /**
     * 更新会话头像。
     *
     * @param conversationId 会话 ID
     * @param file           头像文件
     * @return 更新后的会话信息
     */
    @PostMapping("/{id}/avatar")
    public Result<ConversationVO> updateAvatar(@PathVariable("id") Long conversationId,
                                                @RequestParam("file") MultipartFile file) {
        return Result.success(conversationService.updateAvatar(conversationId, getCurrentUserId(), file));
    }

    /**
     * 恢复会话默认头像。
     *
     * @param conversationId 会话 ID
     * @return 更新后的会话信息
     */
    @DeleteMapping("/{id}/avatar")
    public Result<ConversationVO> restoreDefaultAvatar(@PathVariable("id") Long conversationId) {
        return Result.success(conversationService.restoreDefaultAvatar(conversationId, getCurrentUserId()));
    }

    /**
     * 转让群主。
     *
     * @param conversationId 会话 ID
     * @param request        群主转让请求
     * @return 更新后的会话信息
     */
    @PutMapping("/{id}/owner")
    public Result<ConversationVO> transferOwner(@PathVariable("id") Long conversationId,
                                                 @RequestBody TransferConversationOwnerRequest request) {
        return Result.success(conversationService.transferOwner(conversationId, getCurrentUserId(), request));
    }

    /**
     * 设置会话置顶状态。
     *
     * @param conversationId 会话 ID
     * @param pinned         是否置顶
     * @return 操作结果
     */
    @PutMapping("/{id}/pin")
    public Result<Void> pinConversation(@PathVariable("id") Long conversationId,
                                         @RequestParam boolean pinned) {
        Long userId = getCurrentUserId();
        conversationService.pinConversation(conversationId, userId, pinned);
        return Result.ok();
    }

    /**
     * 设置会话免打扰状态。
     *
     * @param conversationId 会话 ID
     * @param muted          是否免打扰
     * @return 操作结果
     */
    @PutMapping("/{id}/mute")
    public Result<Void> muteConversation(@PathVariable("id") Long conversationId,
                                         @RequestParam boolean muted) {
        Long userId = getCurrentUserId();
        conversationService.muteConversation(conversationId, userId, muted);
        return Result.ok();
    }

    /**
     * 查询会话详情。
     *
     * @param id 会话 ID
     * @return 会话信息
     */
    @GetMapping("/{id}")
    public Result<ConversationVO> getConversation(@PathVariable("id") Long id) {
        Long userId = getCurrentUserId();
        return Result.success(conversationService.getById(id, userId));
    }

    /**
     * 解散群聊（仅群主可操作）。
     *
     * @param id 会话 ID
     * @return 操作结果
     */
    @DeleteMapping("/{id}")
    public Result<Void> dissolveGroup(@PathVariable("id") Long id) {
        Long userId = getCurrentUserId();
        conversationService.dissolveGroup(id, userId);
        return Result.ok();
    }

    private Long getCurrentUserId() {
        String userIdStr = (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return Long.parseLong(userIdStr);
    }
}
