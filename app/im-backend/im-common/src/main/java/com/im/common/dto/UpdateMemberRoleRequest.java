package com.im.common.dto;

import lombok.Data;

/**
 * 更新成员角色请求，用于设置或取消群管理员等角色。
 */
@Data
public class UpdateMemberRoleRequest {
    private String role; // 目标角色（如管理员/普通成员）
}
