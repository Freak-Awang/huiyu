package com.im.common.dto;

import lombok.Data;

/**
 * 发送消息请求，客户端向指定会话投递消息。
 */
@Data
public class SendMessageRequest {

    private Long conversationId; // 目标会话ID

    private String messageType; // 消息类型（文本/图片/文件等）

    private String content; // 消息内容

    private String clientMsgId; // 客户端消息ID（去重与幂等用）
}
