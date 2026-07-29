package com.im.common.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 用户实体，记录IM系统用户的账号、资料与组织归属信息。
 */
@Data
@TableName("sys_user")
public class SysUser {
    @TableId(type = IdType.AUTO)
    private Long id; // 用户ID
    private String username; // 登录用户名
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String password; // 登录密码（仅反序列化写入，序列化时不输出）
    private String nickname; // 用户昵称
    private String email; // 邮箱
    private String phone; // 手机号
    private String avatar; // 头像地址
    private String signature; // 个性签名
    private Long deptId; // 所属部门ID
    private String role; // 用户角色
    private Integer status; // 账号状态（如正常/禁用）
    private Integer tokenVersion; // 令牌版本号（修改后旧令牌失效，用于强制下线）
    private LocalDateTime createTime; // 创建时间
    private LocalDateTime updateTime; // 更新时间
}
