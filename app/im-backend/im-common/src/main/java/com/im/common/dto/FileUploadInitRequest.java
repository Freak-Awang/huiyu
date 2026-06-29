package com.im.common.dto;

import lombok.Data;

/**
 * ?????FileUploadInitRequest carries API payload shape between client, controller, and service layers.
 */
@Data
public class FileUploadInitRequest {
    private Long conversationId;
    private String transferId;
    private String fileName;
    private Long fileSize;
    private String contentType;
    private String sha256;
}
