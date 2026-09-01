package com.im.common.dto.update;

import lombok.Data;

/**
 * 客户端更新结果上报请求，用于更新遥测与成功率统计。
 */
@Data
public class UpdateReportRequest {
    private String deviceId; // 设备唯一标识（必填）
    private String currentVersion; // 事件发生时客户端版本
    private String targetVersion; // 目标版本
    private String eventType; // check/download_success/download_failed/install_success/install_failed/rollback
    private String errorMessage; // 失败原因（可空）
    private String channel; // 发布渠道，默认 stable
}
