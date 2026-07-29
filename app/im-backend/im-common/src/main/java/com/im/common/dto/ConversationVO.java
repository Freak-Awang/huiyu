package com.im.common.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 会话视图对象，向客户端返回单聊/群聊的完整展示信息。
 */
@Data
public class ConversationVO {

    private Long conversationId; // 会话ID

    private Integer type; // 会话类型：1-单聊，2-群聊

    private String name; // 会话名称（群聊为群名，单聊为对方昵称）

    private String avatar; // 会话头像地址

    private String avatarType; // 头像类型（如默认/自定义）

    private Long avatarUpdatedBy; // 最近修改头像的用户ID

    private LocalDateTime avatarUpdatedAt; // 头像最近修改时间

    private Long ownerId; // 群主/会话创建者ID

    private Boolean canEditAvatar; // 当前用户是否有权限修改会话头像

    private String announcement; // 群公告内容

    private Long announcementUpdatedBy; // 最近修改公告的用户ID

    private LocalDateTime announcementUpdatedAt; // 公告最近修改时间

    private String lastMessage; // 最后一条消息摘要

    private LocalDateTime lastMessageTime; // 最后一条消息时间

    private Integer unreadCount; // 未读消息数

    private Integer mentionUnreadCount; // @我的未读消息数

    private Integer isPinned; // 是否置顶：0-否，1-是

    private Integer isMuted; // 是否免打扰：0-否，1-是

    private Integer memberCount; // 会话成员数

    private List<MemberVO> members; // 成员列表（按需返回）
}
