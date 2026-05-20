package com.im.common.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class MessageVO {

    private Long messageId;

    private Long conversationId;

    private Long senderId;

    private String senderName;

    private String senderAvatar;

    private String messageType;

    private String content;

    private String status;

    private String clientMsgId;

    private LocalDateTime createTime;
}
