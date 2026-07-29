package com.im.common.dto;

import lombok.Data;

/**
 * 创建断点续传任务请求，在发送分片前向服务端登记文件元信息。
 */
@Data
public class FileUploadTaskCreateRequest {
    private String fileName; // 原始文件名
    private Long fileSize; // 文件总大小（字节）
    private String fileHash; // 文件哈希（秒传识别用）
    private String sha256; // 文件SHA-256校验值
    private String mimeType; // 文件MIME类型
    private String contentType; // 上传内容类型
    private Long conversationId; // 目标会话ID
    private String conversationType; // 目标会话类型（单聊/群聊）
}
