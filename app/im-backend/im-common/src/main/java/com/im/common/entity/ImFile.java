package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Intent: ImFile mirrors a persisted domain table and keeps ORM mapping metadata with the model.
 */
@Data
@TableName("im_file")
public class ImFile {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String originalName;
    private String storedName;
    private String filePath;
    private Long fileSize;
    private String contentType;
    private Long uploaderId;
    private Long conversationId;
    private String sha256;
    private String storageType;
    private String bucket;
    private String objectKey;
    private String status;
    private Integer downloadCount;
    private LocalDateTime createTime;
    private LocalDateTime expiresAt;
    private Integer temporary;
}
