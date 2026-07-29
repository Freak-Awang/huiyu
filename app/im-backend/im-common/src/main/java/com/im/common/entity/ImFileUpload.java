package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 文件上传任务实体，记录断点续传任务的整体状态与存储参数。
 */
@Data
@TableName("im_file_upload")
public class ImFileUpload {
    @TableId(type = IdType.AUTO)
    private Long id; // 主键ID
    private String uploadId; // 上传任务ID（客户端续传凭证）
    private Long uploaderId; // 上传者ID
    private Long conversationId; // 目标会话ID
    private String fileName; // 原始文件名
    private Long fileSize; // 文件总大小（字节）
    private String contentType; // 文件MIME类型
    private String sha256; // 文件SHA-256校验值
    private Long chunkSize; // 分片大小（字节）
    private Integer totalParts; // 分片总数
    private String storageType; // 存储类型（本地/对象存储）
    private String bucket; // 对象存储桶名
    private String objectKey; // 对象存储对象键
    private String status; // 任务状态（如上传中/已完成/已过期）
    private Long fileId; // 合并完成后关联的文件ID
    private LocalDateTime createTime; // 创建时间
    private LocalDateTime updateTime; // 更新时间
    private LocalDateTime expiresAt; // 任务过期时间（超时未完成将被清理）
}
