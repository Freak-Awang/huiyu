package com.im.common.dto;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * Public user profile exposed to authenticated IM clients. Password data must never enter this DTO.
 */
@Data
public class UserProfileVO {

    private Long userId;
    private String username;
    private String nickname;
    private String avatar;
    private String signature;
    private String email;
    private String phone;
    private Long deptId;
    private String deptName;
    private String role;
    private Integer status;
    private LocalDateTime updatedAt;
}
