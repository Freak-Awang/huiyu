package com.im.server.service;

import com.im.common.dto.ConversationVO;
import com.im.common.dto.CreateConversationRequest;
import java.util.List;

public interface ConversationService {

    List<ConversationVO> listConversations(Long userId);

    ConversationVO createConversation(Long userId, CreateConversationRequest request);

    void addMembers(Long conversationId, List<Long> userIds, Long operatorId);

    void removeMember(Long conversationId, Long userId, Long operatorId);

    void pinConversation(Long conversationId, Long userId, boolean pinned);

    ConversationVO getById(Long id, Long userId);
}
