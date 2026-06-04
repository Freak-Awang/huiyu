package com.im.common.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class FileTransferVO {
    private String transferId;
    private String mode;
    private String status;
    private Long fileId;
    private String fileName;
    private Long fileSize;
    private String contentType;
    private String sha256;
    private LocalDateTime expiresAt;
}
