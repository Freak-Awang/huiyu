package com.im.common.dto;

import lombok.Data;

@Data
public class FileTransferInitRequest {
    private Long conversationId;
    private String fileName;
    private Long fileSize;
    private String contentType;
    private String sha256;
    private String mode;
}
