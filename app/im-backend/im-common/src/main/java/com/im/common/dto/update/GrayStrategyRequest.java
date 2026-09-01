package com.im.common.dto.update;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 灰度策略配置请求（管理端）。
 */
@Data
public class GrayStrategyRequest {
    private String strategyType; // all/gray/whitelist
    private Integer grayPercent; // 灰度百分比 0-100
    private List<String> whitelist; // 白名单设备 ID 列表
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime startTime; // 生效时间
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime endTime; // 截止时间（可空）
}
