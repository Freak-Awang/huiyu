package com.im.common.dto;

import lombok.Data;

/**
 * 转让群主请求，指定接任群主角色的成员。
 */
@Data
public class TransferConversationOwnerRequest {
    private Long newOwnerId; // 新群主的用户ID
}
