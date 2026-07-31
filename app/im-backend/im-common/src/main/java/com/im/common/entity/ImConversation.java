package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 会话实体，对应单聊/群聊会话表，维护会话基本信息与最新消息摘要。
 */
@Data
@TableName("im_conversation")
public class ImConversation {
    @TableId(type = IdType.AUTO)
    private Long id; // 会话ID
    private Integer type; // 会话类型：1-单聊，2-群聊
    private String name; // 会话名称（群聊为群名）
    private String avatar; // 会话头像地址
    private String avatarType; // 头像类型（如默认/自定义）
    private Long avatarUpdatedBy; // 最近修改头像的用户ID
    private LocalDateTime avatarUpdatedAt; // 头像最近修改时间
    private Long ownerId; // 群主/会话创建者ID
    private String createRequestId; // 群聊创建幂等请求ID
    private String announcement; // 群公告内容
    private Long announcementUpdatedBy; // 最近修改公告的用户ID
    private LocalDateTime announcementUpdatedAt; // 公告最近修改时间
    private String lastMessage; // 最后一条消息摘要（会话列表展示用）
    private LocalDateTime lastMessageTime; // 最后一条消息时间（会话排序用）
    private LocalDateTime createTime; // 创建时间
    private LocalDateTime updateTime; // 更新时间
}
