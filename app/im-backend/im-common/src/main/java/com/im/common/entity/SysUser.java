package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Intent: SysUser mirrors a persisted domain table and keeps ORM mapping metadata with the model.
 */
@Data
@TableName("sys_user")
public class SysUser {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String username;
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String password;
    private String nickname;
    private String email;
    private String phone;
    private String avatar;
    private String signature;
    private Long deptId;
    private String role;
    private Integer status;
    private Integer tokenVersion;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
