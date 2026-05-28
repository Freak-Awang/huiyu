package com.im.server.service;

import com.im.common.dto.MessageVO;
import com.im.common.dto.SendMessageRequest;
import com.im.common.entity.ImMessage;
import com.im.common.result.PageResult;

import java.util.List;

public interface MessageService {

    PageResult<MessageVO> getMessages(Long userId, Long conversationId, Long beforeMessageId, int pageSize);

    PageResult<MessageVO> searchMessages(Long userId, Long conversationId, String keyword, int pageSize);

    ImMessage sendMessage(Long senderId, SendMessageRequest request);

    MessageVO recallMessage(Long userId, Long messageId);

    List<MessageVO> getPendingMessages(Long userId, int limit);

    void acknowledgeMessage(Long userId, Long messageId);

    void markConversationRead(Long userId, Long conversationId, Long lastReadMessageId);

    void cleanupExpiredMessages();
}
