package com.im.common.dto;

import lombok.Data;

/**
 * Intent: FileUploadTaskCreateRequest describes a resumable upload before chunks are sent.
 */
@Data
public class FileUploadTaskCreateRequest {
    private String fileName;
    private Long fileSize;
    private String fileHash;
    private String sha256;
    private String mimeType;
    private String contentType;
    private Long conversationId;
    private String conversationType;
}
