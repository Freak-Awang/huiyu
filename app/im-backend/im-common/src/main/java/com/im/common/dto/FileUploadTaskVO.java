package com.im.common.dto;

import lombok.Data;

import java.util.List;
import java.time.LocalDateTime;

/**
 * 断点续传任务视图对象，向客户端返回上传状态与存储参数，支持秒传与续传。
 */
@Data
public class FileUploadTaskVO {
    private String uploadId; // 上传任务ID
    private Boolean fileExists; // 文件是否已存在（秒传命中）
    private Long fileId; // 已存在文件的ID（秒传命中时返回）
    private Long chunkSize; // 分片大小（字节）
    private Integer chunkCount; // 分片总数
    private String uploadMode; // 上传模式（如直传/分片）
    private String storageType; // 存储类型（本地/对象存储）
    private String status; // 任务状态
    private LocalDateTime expiresAt; // 任务过期时间
    private List<Integer> uploadedParts; // 已上传的分片编号列表（续传依据）
    private FileVO file; // 关联文件信息（秒传命中时返回）
}
