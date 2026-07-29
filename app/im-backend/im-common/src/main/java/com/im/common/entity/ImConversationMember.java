package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 会话成员实体，记录用户在会话中的角色及个人会话偏好（置顶/免打扰/已读位置）。
 */
@Data
@TableName("im_conversation_member")
public class ImConversationMember {
    @TableId(type = IdType.AUTO)
    private Long id; // 主键ID
    private Long conversationId; // 会话ID
    private Long userId; // 用户ID
    private String role; // 群内角色（如群主/管理员/普通成员）
    private Integer isPinned; // 是否置顶：0-否，1-是
    private Integer isMuted; // 是否免打扰：0-否，1-是
    private LocalDateTime lastReadTime; // 最后已读时间（计算未读数依据）
    private LocalDateTime joinTime; // 加入会话时间
}
