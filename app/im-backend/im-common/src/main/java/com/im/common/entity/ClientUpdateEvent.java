package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 客户端更新遥测事件实体，记录检测、下载、安装、回滚等更新链路事件。
 */
@Data
@TableName("client_update_event")
public class ClientUpdateEvent {
    @TableId(type = IdType.AUTO)
    private Long id; // 主键
    private String deviceId; // 设备唯一标识
    private Long userId; // 关联用户（可空）
    private String currentVersion; // 事件发生时客户端版本
    private String targetVersion; // 目标版本
    private String eventType; // check/download_success/download_failed/install_success/install_failed/rollback
    private String errorMessage; // 失败原因（可空）
    private String channel; // 发布渠道
    private LocalDateTime createTime; // 创建时间
}
