package com.im.common.dto;

import lombok.Data;

import java.util.List;

/**
 * ?????CreateConversationRequest carries API payload shape between client, controller, and service layers.
 */
@Data
public class CreateConversationRequest {

    private Integer type;

    private Long targetUserId;

    private String name;

    private List<Long> memberIds;
}
