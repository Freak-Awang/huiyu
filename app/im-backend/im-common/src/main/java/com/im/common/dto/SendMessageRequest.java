package com.im.common.dto;

import lombok.Data;

@Data
public class SendMessageRequest {

    private Long conversationId;

    private String messageType;

    private String content;

    private String clientMsgId;
}
