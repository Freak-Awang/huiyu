package com.im.common.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 登录响应，认证成功后返回访问令牌与用户基本信息。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class LoginResponse {
    private String token; // JWT访问令牌
    private Long userId; // 用户ID
    private String nickname; // 用户昵称
    private String avatar; // 用户头像地址
    private String signature; // 用户个性签名
    private String role; // 用户角色
}
