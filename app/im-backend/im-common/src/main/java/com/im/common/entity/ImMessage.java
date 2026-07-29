package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 消息实体，记录会话中发送的消息内容与状态。
 */
@Data
@TableName("im_message")
public class ImMessage {
    @TableId(type = IdType.AUTO)
    private Long id; // 消息ID
    private Long conversationId; // 所属会话ID
    private Long senderId; // 发送者ID
    private String messageType; // 消息类型（文本/图片/文件等）
    private String content; // 消息内容
    private String status; // 消息状态（如正常/撤回）
    private String clientMsgId; // 客户端消息ID（去重与幂等用）
    private LocalDateTime createTime; // 发送时间
    private LocalDateTime expiresAt; // 过期时间（超时消息自动清理）
}
