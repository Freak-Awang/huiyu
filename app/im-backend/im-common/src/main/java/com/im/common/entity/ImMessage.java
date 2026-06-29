package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * ?????ImMessage mirrors a persisted domain table and keeps ORM mapping metadata with the model.
 */
@Data
@TableName("im_message")
public class ImMessage {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long conversationId;
    private Long senderId;
    private String messageType;
    private String content;
    private String status;
    private String clientMsgId;
    private LocalDateTime createTime;
    private LocalDateTime expiresAt;
}
