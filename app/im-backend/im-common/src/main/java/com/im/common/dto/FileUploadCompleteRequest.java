package com.im.common.dto;

import lombok.Data;

/**
 * ?????FileUploadCompleteRequest carries API payload shape between client, controller, and service layers.
 */
@Data
public class FileUploadCompleteRequest {
    private String sha256;
}
