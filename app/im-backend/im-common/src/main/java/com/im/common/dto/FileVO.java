package com.im.common.dto;

import lombok.Data;

import java.time.LocalDateTime;

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
    private LocalDateTime expiresAt;
}
