package com.im.common.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * Intent: MessageVO carries API payload shape between client, controller, and service layers.
 */
@Data
public class MessageVO {

    private Long messageId;

    private Long conversationId;

    private Long senderId;

    private String senderName;

    private String senderAvatar;

    private String senderSignature;

    private String messageType;

    private String content;

    private String status;

    private String clientMsgId;

    private LocalDateTime createTime;

    private Integer readCount;

    private Integer recipientCount;

    private Integer readStatus;

    private LocalDateTime readTime;
}
