package com.im.common.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Intent: LoginResponse carries API payload shape between client, controller, and service layers.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class LoginResponse {
    private String token;
    private Long userId;
    private String nickname;
    private String avatar;
    private String signature;
    private String role;
}
