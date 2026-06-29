package com.im.common.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * ?????ConversationVO carries API payload shape between client, controller, and service layers.
 */
@Data
public class ConversationVO {

    private Long conversationId;

    private Integer type;

    private String name;

    private String avatar;

    private String announcement;

    private Long announcementUpdatedBy;

    private LocalDateTime announcementUpdatedAt;

    private String lastMessage;

    private LocalDateTime lastMessageTime;

    private Integer unreadCount;

    private Integer mentionUnreadCount;

    private Integer isPinned;

    private Integer isMuted;

    private Integer memberCount;

    private List<MemberVO> members;
}
