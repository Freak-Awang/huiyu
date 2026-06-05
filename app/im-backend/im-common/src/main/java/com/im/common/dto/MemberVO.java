package com.im.common.dto;

import lombok.Data;

@Data
public class MemberVO {

    private Long userId;

    private String nickname;

    private String avatar;

    private String signature;

    private String role;
}
