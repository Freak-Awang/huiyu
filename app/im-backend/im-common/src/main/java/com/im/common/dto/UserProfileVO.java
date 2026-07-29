package com.im.common.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 用户公开资料视图对象，向已认证的IM客户端暴露。密码等敏感数据绝不进入该DTO。
 */
@Data
public class UserProfileVO {

    private Long userId; // 用户ID
    private String username; // 登录用户名
    private String nickname; // 用户昵称
    private String avatar; // 用户头像地址
    private String signature; // 个性签名
    private String email; // 邮箱
    private String phone; // 手机号
    private Long deptId; // 所属部门ID
    private String deptName; // 所属部门名称
    private String role; // 用户角色
    private Integer status; // 账号状态（如正常/禁用）
    private LocalDateTime updatedAt; // 资料最近更新时间
}
