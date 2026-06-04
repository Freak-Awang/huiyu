package com.im.common.dto;

import lombok.Data;

@Data
public class FileUploadInitRequest {
    private Long conversationId;
    private String transferId;
    private String fileName;
    private Long fileSize;
    private String contentType;
    private String sha256;
}
