package com.im.common.dto;

import lombok.Data;

import java.util.List;

@Data
public class CreateConversationRequest {

    private Integer type;

    private Long targetUserId;

    private String name;

    private List<Long> memberIds;
}
