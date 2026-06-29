package com.im.common.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * ?????FileTransferVO carries API payload shape between client, controller, and service layers.
 */
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
    private String fallbackReason;
    private Boolean receiverOnline;
}
