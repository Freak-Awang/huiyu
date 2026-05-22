package com.im.common.dto;

import lombok.Data;

import java.util.List;

@Data
public class ConversationMembersRequest {
    private List<Long> userIds;
}
