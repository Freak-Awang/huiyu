package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 设备版本追踪实体，记录每台设备当前的客户端版本与更新历史。
 */
@Data
@TableName("device_version")
public class DeviceVersion {
    @TableId(type = IdType.AUTO)
    private Long id; // 主键
    private String deviceId; // 客户端设备唯一标识
    private String currentVersion; // 当前版本号
    private Integer currentBuild; // 当前构建号
    private String channel; // 订阅的发布渠道
    private LocalDateTime lastCheckTime; // 最近检测更新时间
    private LocalDateTime lastUpdateTime; // 最近完成更新时间
    private Integer updateCount; // 累计更新次数
    private LocalDateTime createTime; // 创建时间
    private LocalDateTime updateTime; // 更新时间
}
