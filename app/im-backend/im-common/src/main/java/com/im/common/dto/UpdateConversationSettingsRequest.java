package com.im.common.dto;

import lombok.Data;

@Data
public class UpdateConversationSettingsRequest {
    private String name;
    private String announcement;
}
