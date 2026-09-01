package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 客户端版本实体，记录桌面端发布版本及更新策略元数据。
 */
@Data
@TableName("app_version")
public class AppVersion {
    /** 更新类型：无更新 */
    public static final String TYPE_NONE = "none";
    /** 更新类型：增量更新 */
    public static final String TYPE_INCREMENTAL = "incremental";
    /** 更新类型：全量更新 */
    public static final String TYPE_FULL = "full";
    /** 更新类型：强制更新 */
    public static final String TYPE_FORCE = "force";

    /** 状态：草稿 */
    public static final int STATUS_DRAFT = 0;
    /** 状态：已发布 */
    public static final int STATUS_PUBLISHED = 1;
    /** 状态：已下架 */
    public static final int STATUS_OFFLINE = 2;

    @TableId(type = IdType.AUTO)
    private Long id; // 主键
    private String version; // 版本号 如 3.2.5
    private Integer buildNumber; // 构建号 如 20260901
    private String channel; // 发布渠道 stable/beta/alpha
    private String updateType; // 更新类型 none/incremental/full/force
    private String changelog; // 更新日志 JSON 数组
    private String minVersion; // 最低兼容版本，低于此版本强制更新
    private LocalDateTime forceDeadline; // 强制更新截止时间
    private Integer status; // 0-草稿 1-发布 2-下架
    private LocalDateTime createTime; // 创建时间
    private LocalDateTime updateTime; // 更新时间
}
