package com.im.common.dto;

import lombok.Data;

/**
 * Intent: TransferConversationOwnerRequest identifies the member who will become the new group owner.
 */
@Data
public class TransferConversationOwnerRequest {
    private Long newOwnerId;
}
