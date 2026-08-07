package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 客户端更新事件实体，记录客户端升级过程中的各类事件，用于统计与问题排查。
 */
@Data
@TableName("im_client_update_event")
public class ImClientUpdateEvent {
    @TableId(type = IdType.AUTO)
    private Long id; // 主键ID
    private Long userId; // 用户ID
    private Long releaseId; // 发布记录ID
    private String deviceId; // 设备ID
    private String currentVersion; // 当前版本号
    private String targetVersion; // 目标版本号
    private String eventType; // 事件类型（如检查更新/下载/安装/失败）
    private String errorMessage; // 失败时的错误信息
    private String platform; // 客户端平台
    private String arch; // 客户端架构
    private String channel; // 发布渠道
    private LocalDateTime createTime; // 事件上报时间
}
