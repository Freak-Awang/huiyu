package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 用户个性化设置实体，以JSON字符串形式持久化客户端通用设置与通知设置。
 */
@Data
@TableName("im_user_settings")
public class ImUserSettings {
    @TableId(type = IdType.AUTO)
    private Long id; // 主键ID
    private Long userId; // 用户ID
    private String generalSettings; // 通用设置（JSON字符串）
    private String notificationSettings; // 通知设置（JSON字符串）
    private LocalDateTime createTime; // 创建时间
    private LocalDateTime updateTime; // 更新时间
}
