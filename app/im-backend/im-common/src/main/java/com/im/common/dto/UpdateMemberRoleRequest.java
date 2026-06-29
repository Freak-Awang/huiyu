package com.im.common.dto;

import lombok.Data;

/**
 * Intent: UpdateMemberRoleRequest carries API payload shape between client, controller, and service layers.
 */
@Data
public class UpdateMemberRoleRequest {
    private String role;
}
