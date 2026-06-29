package com.im.common.dto;

import lombok.Data;

/**
 * ?????UpdateConversationSettingsRequest carries API payload shape between client, controller, and service layers.
 */
@Data
public class UpdateConversationSettingsRequest {
    private String name;
    private String announcement;
}
