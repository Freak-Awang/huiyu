package com.im.server.service;

import com.im.common.dto.ConversationVO;
import com.im.common.dto.CreateConversationRequest;
import com.im.common.dto.UpdateConversationSettingsRequest;
import com.im.common.dto.UpdateMemberRoleRequest;
import java.util.List;
/**
 * ?????ConversationService defines the service contract used by controllers and async workflows.
 */

public interface ConversationService {

    List<ConversationVO> listConversations(Long userId);

    ConversationVO createConversation(Long userId, CreateConversationRequest request);

    void addMembers(Long conversationId, List<Long> userIds, Long operatorId);

    void removeMember(Long conversationId, Long userId, Long operatorId);

    void pinConversation(Long conversationId, Long userId, boolean pinned);

    void muteConversation(Long conversationId, Long userId, boolean muted);

    ConversationVO updateSettings(Long conversationId, Long operatorId, UpdateConversationSettingsRequest request);

    ConversationVO updateMemberRole(Long conversationId, Long targetUserId, Long operatorId, UpdateMemberRoleRequest request);

    ConversationVO getById(Long id, Long userId);
}
