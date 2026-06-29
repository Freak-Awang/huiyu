package com.im.common.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * Intent: FileVO carries API payload shape between client, controller, and service layers.
 */
@Data
public class FileVO {
    private Long id;
    private String originalName;
    private Long size;
    private String displaySize;
    private String contentType;
    private String sha256;
    private String status;
    private String url;
    private Long conversationId;
    private Long uploaderId;
    private String uploaderName;
    private LocalDateTime createdAt;
    private Integer downloadCount;
    private LocalDateTime expiresAt;
}
