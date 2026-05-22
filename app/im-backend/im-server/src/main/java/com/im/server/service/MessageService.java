package com.im.server.service;

import com.im.common.dto.MessageVO;
import com.im.common.dto.SendMessageRequest;
import com.im.common.entity.ImMessage;
import com.im.common.result.PageResult;

public interface MessageService {

    PageResult<MessageVO> getMessages(Long userId, Long conversationId, Long beforeMessageId, int pageSize);

    ImMessage sendMessage(Long senderId, SendMessageRequest request);
}
