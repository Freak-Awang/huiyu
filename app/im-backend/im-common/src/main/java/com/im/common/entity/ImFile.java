package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 文件实体，记录会话内共享文件的元信息与存储位置。
 */
@Data
@TableName("im_file")
public class ImFile {
    @TableId(type = IdType.AUTO)
    private Long id; // 文件ID
    private String originalName; // 原始文件名
    private String storedName; // 存储文件名
    private String filePath; // 本地存储路径
    private Long fileSize; // 文件大小（字节）
    private String contentType; // 文件MIME类型
    private Long uploaderId; // 上传者ID
    private Long conversationId; // 所属会话ID
    private String sha256; // 文件SHA-256校验值（秒传与完整性校验用）
    private String storageType; // 存储类型（本地/对象存储）
    private String bucket; // 对象存储桶名
    private String objectKey; // 对象存储对象键
    private String status; // 文件状态（如正常/过期）
    private Integer downloadCount; // 下载次数
    private LocalDateTime createTime; // 上传时间
    private LocalDateTime expiresAt; // 过期时间
    private Integer temporary; // 是否临时文件：0-否，1-是
}
