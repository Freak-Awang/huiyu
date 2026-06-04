package com.im.common.dto;

import lombok.Data;

import java.util.List;

@Data
public class FileUploadVO {
    private String uploadId;
    private String transferId;
    private Long chunkSize;
    private Integer totalParts;
    private List<Integer> uploadedParts;
    private String status;
    private Boolean instant;
    private FileVO file;
}
