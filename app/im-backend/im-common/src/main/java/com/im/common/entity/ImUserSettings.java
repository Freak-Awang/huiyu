package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("im_user_settings")
public class ImUserSettings {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String generalSettings;
    private String notificationSettings;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
