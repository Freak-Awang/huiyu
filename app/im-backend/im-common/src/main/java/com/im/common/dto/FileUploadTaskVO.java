package com.im.common.dto;

import lombok.Data;

import java.util.List;

/**
 * Intent: FileUploadTaskVO returns resumable upload state and storage parameters to clients.
 */
@Data
public class FileUploadTaskVO {
    private String uploadId;
    private Boolean fileExists;
    private Long fileId;
    private Long chunkSize;
    private Integer chunkCount;
    private String uploadMode;
    private String storageType;
    private List<Integer> uploadedParts;
    private FileVO file;
}
