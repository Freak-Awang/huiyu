package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Intent: ImFileTransfer mirrors a persisted domain table and keeps ORM mapping metadata with the model.
 */
@Data
@TableName("im_file_transfer")
public class ImFileTransfer {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String transferId;
    private Long senderId;
    private Long conversationId;
    private String fileName;
    private Long fileSize;
    private String contentType;
    private String sha256;
    private String mode;
    private String status;
    private Long fileId;
    private String fallbackReason;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private LocalDateTime expiresAt;
}
