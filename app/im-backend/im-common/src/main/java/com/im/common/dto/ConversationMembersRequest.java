package com.im.common.dto;

import lombok.Data;

import java.util.List;

/**
 * 会话成员批量操作请求，用于群聊中添加或移除成员。
 */
@Data
public class ConversationMembersRequest {
    private List<Long> userIds; // 目标用户ID列表
}
