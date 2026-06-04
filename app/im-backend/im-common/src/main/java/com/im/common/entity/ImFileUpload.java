package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("im_file_upload")
public class ImFileUpload {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String uploadId;
    private String transferId;
    private Long uploaderId;
    private Long conversationId;
    private String fileName;
    private Long fileSize;
    private String contentType;
    private String sha256;
    private Long chunkSize;
    private Integer totalParts;
    private String storageType;
    private String bucket;
    private String objectKey;
    private String status;
    private Long fileId;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    private LocalDateTime expiresAt;
}
