package com.im.common.dto;

import lombok.Data;

/**
 * 分片上传完成请求，客户端在所有分片上传成功后调用以触发合并。
 */
@Data
public class FileUploadCompleteRequest {
    private String sha256; // 完整文件的SHA-256校验值，用于合并后完整性校验
}
