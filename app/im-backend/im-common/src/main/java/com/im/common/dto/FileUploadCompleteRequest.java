package com.im.common.dto;

import lombok.Data;

/**
 * Intent: FileUploadCompleteRequest confirms that all chunks for an upload task are present.
 */
@Data
public class FileUploadCompleteRequest {
    private String sha256;
}
