package com.im.common.dto;

import lombok.Data;

import java.util.List;

/**
 * 创建会话请求，用于发起单聊或创建群聊。
 */
@Data
public class CreateConversationRequest {

    private Integer type; // 会话类型：1-单聊，2-群聊

    private Long targetUserId; // 单聊时的目标用户ID

    private String name; // 兼容旧客户端；新建群聊名称由服务端统一生成

    private String requestId; // 群聊创建请求幂等标识，同一创建人下唯一

    private List<Long> memberIds; // 群聊初始成员ID列表
}
