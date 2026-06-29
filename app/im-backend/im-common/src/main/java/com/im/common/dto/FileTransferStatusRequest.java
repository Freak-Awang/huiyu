package com.im.common.dto;

import lombok.Data;

/**
 * ?????FileTransferStatusRequest carries API payload shape between client, controller, and service layers.
 */
@Data
public class FileTransferStatusRequest {
    private String status;
    private String fallbackReason;
}
