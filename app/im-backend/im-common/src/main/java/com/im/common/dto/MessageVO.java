package com.im.common.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 消息视图对象，向客户端返回会话消息的完整展示信息与已读状态。
 */
@Data
public class MessageVO {

    private Long messageId; // 消息ID

    private Long conversationId; // 所属会话ID

    private Long senderId; // 发送者ID

    private String senderName; // 发送者昵称

    private String senderAvatar; // 发送者头像地址

    private String senderSignature; // 发送者个性签名

    private String messageType; // 消息类型（文本/图片/文件等）

    private String content; // 消息内容

    private String status; // 消息状态（如正常/撤回）

    private String clientMsgId; // 客户端消息ID（去重与幂等用）

    private LocalDateTime createTime; // 发送时间

    private Integer readCount; // 已读人数

    private Integer recipientCount; // 接收者总数

    private Integer readStatus; // 当前用户已读状态：0-未读，1-已读

    private LocalDateTime readTime; // 当前用户已读时间
}
