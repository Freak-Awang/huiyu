package com.im.common.dto;

import lombok.Data;

/**
 * ?????MemberVO carries API payload shape between client, controller, and service layers.
 */
@Data
public class MemberVO {

    private Long userId;

    private String nickname;

    private String avatar;

    private String signature;

    private String role;
}
