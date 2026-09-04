package com.im.common.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 媒体视图对象，向客户端返回图片和头像资源信息。
 */
@Data
public class FileVO {
    private Long id; // 文件ID
    private String originalName; // 原始文件名
    private Long size; // 文件大小（字节）
    private String displaySize; // 格式化后的展示大小（如 1.2MB）
    private String contentType; // 文件MIME类型
    private String sha256; // 文件SHA-256校验值
    private String status; // 文件状态（如正常/过期）
    private String url; // 文件访问地址
    private String downloadUrl; // 文件下载地址
    private Long conversationId; // 所属会话ID
    private Long uploaderId; // 上传者ID
    private String uploaderName; // 上传者昵称
    private LocalDateTime createdAt; // 上传时间
    private Integer downloadCount; // 下载次数
    private LocalDateTime expiresAt; // 过期时间
}
