package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("im_client_update_event")
public class ImClientUpdateEvent {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String deviceId;
    private String currentVersion;
    private String targetVersion;
    private String eventType;
    private String errorMessage;
    private String platform;
    private String arch;
    private String channel;
    private LocalDateTime createTime;
}

