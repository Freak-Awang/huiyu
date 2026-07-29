package com.im.common.dto;

import lombok.Data;

/**
 * 更新会话设置请求，用于修改群聊名称与公告。
 */
@Data
public class UpdateConversationSettingsRequest {
    private String name; // 会话名称
    private String announcement; // 群公告内容
}
