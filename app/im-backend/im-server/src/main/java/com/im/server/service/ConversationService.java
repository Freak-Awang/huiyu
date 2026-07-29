package com.im.server.service;

import com.im.common.dto.ConversationVO;
import com.im.common.dto.CreateConversationRequest;
import com.im.common.dto.TransferConversationOwnerRequest;
import com.im.common.dto.UpdateConversationSettingsRequest;
import com.im.common.dto.UpdateMemberRoleRequest;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
/**
 * 会话服务接口：定义单聊/群聊的创建、成员管理、设置变更、头像管理及群主转让等业务契约。
 */
public interface ConversationService {

    /**
     * 查询当前用户的会话列表，按置顶和最后消息时间排序。
     *
     * @param userId 用户 ID
     * @return 会话视图列表
     */
    List<ConversationVO> listConversations(Long userId);

    /**
     * 创建会话（单聊或群聊）。
     *
     * @param userId 创建者用户 ID
     * @param request 创建请求
     * @return 会话视图
     */
    ConversationVO createConversation(Long userId, CreateConversationRequest request);

    /**
     * 向群聊添加成员。
     *
     * @param conversationId 会话 ID
     * @param userIds 待添加用户 ID 列表
     * @param operatorId 操作人 ID
     */
    void addMembers(Long conversationId, List<Long> userIds, Long operatorId);

    /**
     * 从会话移除成员（或成员主动退出）。
     *
     * @param conversationId 会话 ID
     * @param userId 被移除用户 ID
     * @param operatorId 操作人 ID
     */
    void removeMember(Long conversationId, Long userId, Long operatorId);

    /**
     * 置顶/取消置顶会话。
     *
     * @param conversationId 会话 ID
     * @param userId 用户 ID
     * @param pinned 是否置顶
     */
    void pinConversation(Long conversationId, Long userId, boolean pinned);

    /**
     * 静音/取消静音会话。
     *
     * @param conversationId 会话 ID
     * @param userId 用户 ID
     * @param muted 是否静音
     */
    void muteConversation(Long conversationId, Long userId, boolean muted);

    /**
     * 更新群聊设置（名称、公告等）。
     *
     * @param conversationId 会话 ID
     * @param operatorId 操作人 ID
     * @param request 设置请求
     * @return 更新后的会话视图
     */
    ConversationVO updateSettings(Long conversationId, Long operatorId, UpdateConversationSettingsRequest request);

    /**
     * 更新群成员角色（管理员/普通成员）。
     *
     * @param conversationId 会话 ID
     * @param targetUserId 目标用户 ID
     * @param operatorId 操作人 ID
     * @param request 角色请求
     * @return 更新后的会话视图
     */
    ConversationVO updateMemberRole(Long conversationId, Long targetUserId, Long operatorId, UpdateMemberRoleRequest request);

    /**
     * 上传并更新群头像。
     *
     * @param conversationId 会话 ID
     * @param operatorId 操作人 ID
     * @param file 头像文件
     * @return 更新后的会话视图
     */
    ConversationVO updateAvatar(Long conversationId, Long operatorId, MultipartFile file);

    /**
     * 恢复群聊默认头像。
     *
     * @param conversationId 会话 ID
     * @param operatorId 操作人 ID
     * @return 更新后的会话视图
     */
    ConversationVO restoreDefaultAvatar(Long conversationId, Long operatorId);

    /**
     * 转让群主。
     *
     * @param conversationId 会话 ID
     * @param operatorId 当前群主 ID
     * @param request 转让请求
     * @return 更新后的会话视图
     */
    ConversationVO transferOwner(Long conversationId, Long operatorId, TransferConversationOwnerRequest request);

    /**
     * 按 ID 查询会话详情（校验成员身份）。
     *
     * @param id 会话 ID
     * @param userId 用户 ID
     * @return 会话视图
     */
    ConversationVO getById(Long id, Long userId);
}
