package com.im.common.dto;

import lombok.Data;

@Data
public class FileTransferStatusRequest {
    private String status;
    private String fallbackReason;
}
