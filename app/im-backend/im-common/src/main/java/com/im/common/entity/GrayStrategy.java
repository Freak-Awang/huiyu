package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 灰度发布策略实体，控制版本按全量/百分比灰度/白名单方式推送。
 */
@Data
@TableName("gray_strategy")
public class GrayStrategy {
    /** 策略类型：全量发布 */
    public static final String TYPE_ALL = "all";
    /** 策略类型：按设备 ID 哈希百分比灰度 */
    public static final String TYPE_GRAY = "gray";
    /** 策略类型：白名单定向发布 */
    public static final String TYPE_WHITELIST = "whitelist";

    @TableId(type = IdType.AUTO)
    private Long id; // 主键
    private Long versionId; // 关联 app_version.id
    private String strategyType; // all/gray/whitelist
    private Integer grayPercent; // 灰度百分比 0-100
    private String whitelist; // 白名单设备ID JSON 数组
    private LocalDateTime startTime; // 生效时间
    private LocalDateTime endTime; // 截止时间（可空）
    private Integer status; // 0-停用 1-启用
    private LocalDateTime createTime; // 创建时间
}
