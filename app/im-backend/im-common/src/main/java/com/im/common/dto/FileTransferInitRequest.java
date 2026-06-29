package com.im.common.dto;

import lombok.Data;

/**
 * Intent: FileTransferInitRequest carries API payload shape between client, controller, and service layers.
 */
@Data
public class FileTransferInitRequest {
    private Long conversationId;
    private Long receiverId;
    private String fileName;
    private Long fileSize;
    private String contentType;
    private String sha256;
    private String mode;
    private String preferredMode;
    private Boolean archiveRequired;
}
