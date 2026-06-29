package com.im.common.dto;

import lombok.Data;

import java.util.List;

/**
 * ?????ConversationMembersRequest carries API payload shape between client, controller, and service layers.
 */
@Data
public class ConversationMembersRequest {
    private List<Long> userIds;
}
