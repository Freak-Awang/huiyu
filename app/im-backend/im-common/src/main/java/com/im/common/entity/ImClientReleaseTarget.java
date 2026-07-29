package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 客户端版本发布目标实体，定义灰度发布的定向投放规则（按用户/部门等维度）。
 */
@Data
@TableName("im_client_release_target")
public class ImClientReleaseTarget {
    @TableId(type = IdType.AUTO)
    private Long id; // 主键ID
    private Long releaseId; // 关联的版本发布ID
    private String targetType; // 目标类型（如用户/部门）
    private String targetValue; // 目标值（如用户ID/部门ID）
    private String mode; // 投放模式（如包含/排除）
    private LocalDateTime createTime; // 创建时间
}

