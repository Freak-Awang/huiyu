package com.im.common.dto;

import lombok.Data;

/**
 * 会话成员视图对象，向客户端返回成员的基本信息与群内角色。
 */
@Data
public class MemberVO {

    private Long userId; // 用户ID

    private String nickname; // 用户昵称

    private String avatar; // 用户头像地址

    private String signature; // 用户个性签名

    private String role; // 群内角色（如群主/管理员/普通成员）
}
