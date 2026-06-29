package com.im.common.dto;

import lombok.Data;

/**
 * Intent: SendMessageRequest carries API payload shape between client, controller, and service layers.
 */
@Data
public class SendMessageRequest {

    private Long conversationId;

    private String messageType;

    private String content;

    private String clientMsgId;
}
