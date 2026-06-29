package com.im.common.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * ?????LoginRequest carries API payload shape between client, controller, and service layers.
 */
@Data
public class LoginRequest {
    @NotBlank(message = "用户名不能为空")
    private String username;

    @NotBlank(message = "密码不能为空")
    private String password;
}
