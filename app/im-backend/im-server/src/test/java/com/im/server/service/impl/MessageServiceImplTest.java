package com.im.server.service.impl;

import com.im.common.dto.SendMessageRequest;
import com.im.common.result.PageResult;
import com.im.common.entity.ImConversation;
import com.im.common.entity.ImConversationMember;
import com.im.common.entity.ImFile;
import com.im.common.entity.ImMessage;
import com.im.common.dto.MessageVO;
import com.im.common.exception.BusinessException;
import com.im.common.entity.SysUser;
import com.im.server.mapper.ConversationMapper;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.MessageDeliveryMapper;
import com.im.server.mapper.MessageMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.service.FileMetadataService;
import com.im.server.websocket.WebSocketSessionManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 消息服务测试，验证消息发送权限、P2P-only 附件边界、图片消息校验和消息列表查询。
 *
 * <p>测试范围：MessageServiceImpl 的 sendMessage（@所有人权限、文件消息校验、图片消息校验）
 * 和 getMessages（发送者签名填充）。</p>
 */
@ExtendWith(MockitoExtension.class)
class MessageServiceImplTest {

    @Mock
    private MessageMapper messageMapper;

    @Mock
    private MessageDeliveryMapper messageDeliveryMapper;

    @Mock
    private ConversationMapper conversationMapper;

    @Mock
    private ConversationMemberMapper conversationMemberMapper;

    @Mock
    private UserMapper userMapper;

    @Mock
    private WebSocketSessionManager sessionManager;

    @Mock
    private FileMetadataService fileMetadataService;

    @InjectMocks
    private MessageServiceImpl messageService;

    /**
     * 验证群主（owner）可以在群聊中发送 @所有人 消息，content 包含 "type":"all"。
     */
    @Test
    void ownerCanSendAllMention() {
        arrangeSend("owner", 2); // 群聊 type=2

        ImMessage message = messageService.sendMessage(10L, allMentionRequest());

        assertThat(message.getContent()).contains("\"type\":\"all\"");
        assertThat(message.getExpiresAt()).isNull();
        verify(messageMapper).insert(any(ImMessage.class));
    }

    /**
     * 验证管理员（admin）可以在群聊中发送 @所有人 消息。
     */
    @Test
    void adminCanSendAllMention() {
        arrangeSend("admin", 2);

        ImMessage message = messageService.sendMessage(10L, allMentionRequest());

        assertThat(message.getContent()).contains("\"userId\":\"__ALL__\"");
        verify(messageMapper).insert(any(ImMessage.class));
    }

    /**
     * 验证普通成员（member）发送 @所有人 被拒绝，返回 403。
     */
    @Test
    void memberCannotSendAllMention() {
        arrangeSenderAndConversation("member", 2);

        assertThatThrownBy(() -> messageService.sendMessage(10L, allMentionRequest()))
                .isInstanceOf(BusinessException.class)
                .hasMessage("只有群主和群管理员可以@所有人")
                .extracting("code")
                .isEqualTo(403);
        verifyNoInteractions(messageMapper); // 未落库
    }

    /**
     * 验证在单聊（type=1）中发送 @所有人 被拒绝。
     */
    @Test
    void allMentionIsRejectedInSingleConversation() {
        arrangeSenderAndConversation("owner", 1); // 单聊

        assertThatThrownBy(() -> messageService.sendMessage(10L, allMentionRequest()))
                .isInstanceOf(BusinessException.class)
                .hasMessage("@所有人只能在群聊中使用")
                .extracting("code")
                .isEqualTo(403);
        verifyNoInteractions(messageMapper);
    }

    /**
     * 验证普通成员仍可发送普通 @用户 消息（非 @所有人）。
     */
    @Test
    void memberCanStillSendRegularMention() {
        arrangeSend("member", 2);

        ImMessage message = messageService.sendMessage(10L, regularMentionRequest());

        assertThat(message.getContent()).contains("\"userId\":\"11\""); // 普通 mention
        verify(messageMapper).insert(any(ImMessage.class));
    }

    /**
     * 验证通用消息入口不能创建任何 FILE 消息。
     */
    @Test
    void malformedFileMessageIsRejected() {
        when(conversationMemberMapper.selectOne(any())).thenReturn(member(10L, "member"));

        assertThatThrownBy(() -> messageService.sendMessage(10L, fileMessageRequest()))
                .isInstanceOf(BusinessException.class)
                .hasMessage("FILE and FOLDER messages must be created through the P2P offer channel")
                .extracting("code")
                .isEqualTo(403);
        verifyNoInteractions(messageMapper);
    }

    /**
     * 验证旧 object_storage 文件消息即使格式完整也被拒绝。
     */
    @Test
    void legacyObjectStorageFileMessageIsRejected() {
        when(conversationMemberMapper.selectOne(any())).thenReturn(member(10L, "member"));

        assertThatThrownBy(() -> messageService.sendMessage(10L, validFileMessageRequest()))
                .isInstanceOf(BusinessException.class)
                .hasMessage("FILE and FOLDER messages must be created through the P2P offer channel")
                .extracting("code")
                .isEqualTo(403);
        verifyNoInteractions(fileMetadataService, messageMapper);
    }

    @Test
    void p2pMessageCannotBeCreatedThroughTheGenericMessagePath() {
        when(conversationMemberMapper.selectOne(any())).thenReturn(member(10L, "member"));

        assertThatThrownBy(() -> messageService.sendMessage(10L, validP2pFileMessageRequest()))
                .isInstanceOf(BusinessException.class)
                .hasMessage("FILE and FOLDER messages must be created through the P2P offer channel")
                .extracting("code")
                .isEqualTo(403);
        verifyNoInteractions(messageMapper);
    }

    @Test
    void authenticatedP2pOfferCanPersistAFileSummaryWithoutFileMetadata() {
        arrangeSend("member", 1);

        ImMessage message = messageService.sendP2pMessage(10L, validP2pFileMessageRequest());

        assertThat(message.getMessageType()).isEqualTo("FILE");
        assertThat(message.getContent()).contains("\"transferMode\":\"p2p_lan\"");
        verifyNoInteractions(fileMetadataService);
        verify(messageMapper).insert(any(ImMessage.class));
    }

    /**
     * 验证合法的图片消息（含 fileId/url/fileName/fileSize/contentType）发送成功。
     */
    @Test
    void validImageMessageReferencesConversationImage() {
        arrangeSend("member", 2);
        ImFile image = file(2L, 1L);
        image.setContentType("image/png");
        when(fileMetadataService.getById(2L)).thenReturn(image);
        SendMessageRequest request = new SendMessageRequest();
        request.setConversationId(1L);
        request.setMessageType("IMAGE");
        request.setContent("{\"fileId\":2,\"url\":\"/api/files/download/2\",\"fileName\":\"photo.png\",\"fileSize\":5,\"contentType\":\"image/png\"}");

        ImMessage message = messageService.sendMessage(10L, request);

        assertThat(message.getMessageType()).isEqualTo("IMAGE");
        verify(messageMapper).insert(any(ImMessage.class));
    }

    /**
     * 验证获取消息列表时 senderName 和 senderSignature 从用户表正确填充。
     */
    @Test
    void getMessagesIncludesSenderSignature() {
        ImMessage message = new ImMessage();
        message.setId(100L);
        message.setConversationId(1L);
        message.setSenderId(10L);
        message.setMessageType("TEXT");
        message.setContent("hello");
        message.setStatus("SENT");
        when(conversationMemberMapper.selectOne(any())).thenReturn(member(11L, "member"));
        when(messageMapper.selectCount(any())).thenReturn(1L);
        when(messageMapper.selectList(any())).thenReturn(List.of(message));
        when(userMapper.selectBatchIds(any())).thenReturn(List.of(user(10L)));
        when(messageDeliveryMapper.selectList(any())).thenReturn(List.of());

        PageResult<MessageVO> page = messageService.getMessages(11L, 1L, null, 50);

        assertThat(page.getData()).singleElement().satisfies(vo -> {
            assertThat(vo.getSenderName()).isEqualTo("用户10");
            assertThat(vo.getSenderSignature()).isEqualTo("签名10");
        });
    }

    private void arrangeSend(String role, int conversationType) {
        arrangeSenderAndConversation(role, conversationType);
        when(messageMapper.insert(any(ImMessage.class))).thenAnswer(invocation -> {
            ImMessage message = invocation.getArgument(0);
            message.setId(100L);
            return 1;
        });
        when(conversationMemberMapper.selectList(any())).thenReturn(List.of(member(10L, role), member(11L, "member")));
    }

    private void arrangeSenderAndConversation(String role, int conversationType) {
        when(conversationMemberMapper.selectOne(any())).thenReturn(member(10L, role));
        when(conversationMapper.selectById(1L)).thenReturn(conversation(conversationType));
    }

    private SendMessageRequest allMentionRequest() {
        SendMessageRequest request = new SendMessageRequest();
        request.setConversationId(1L);
        request.setMessageType("TEXT");
        request.setContent("{\"text\":\"@所有人 开会\",\"mentions\":[{\"type\":\"all\",\"userId\":\"__ALL__\",\"nickname\":\"所有人\"}],\"replyTo\":null}");
        return request;
    }

    private SendMessageRequest regularMentionRequest() {
        SendMessageRequest request = new SendMessageRequest();
        request.setConversationId(1L);
        request.setMessageType("TEXT");
        request.setContent("{\"text\":\"@张三 看一下\",\"mentions\":[{\"type\":\"user\",\"userId\":\"11\",\"nickname\":\"张三\"}],\"replyTo\":null}");
        return request;
    }

    private ImConversation conversation(int type) {
        ImConversation conversation = new ImConversation();
        conversation.setId(1L);
        conversation.setType(type);
        return conversation;
    }

    private SendMessageRequest fileMessageRequest() {
        SendMessageRequest request = new SendMessageRequest();
        request.setConversationId(1L);
        request.setMessageType("FILE");
        request.setContent("{\"fileId\":1}");
        return request;
    }

    private SendMessageRequest validFileMessageRequest() {
        SendMessageRequest request = new SendMessageRequest();
        request.setConversationId(1L);
        request.setMessageType("FILE");
        request.setContent("{\"fileId\":1,\"fileName\":\"report.pdf\",\"fileSize\":5,\"transferMode\":\"object_storage\"}");
        return request;
    }

    private SendMessageRequest validP2pFileMessageRequest() {
        SendMessageRequest request = new SendMessageRequest();
        request.setConversationId(1L);
        request.setMessageType("FILE");
        request.setContent("{\"version\":1,\"transferMode\":\"p2p_lan\","
                + "\"transferId\":\"p2p_abc123\",\"kind\":\"file\","
                + "\"name\":\"report.pdf\",\"totalSize\":5,\"fileCount\":1,"
                + "\"sha256\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}");
        return request;
    }

    private ImFile file(Long fileId, Long conversationId) {
        ImFile file = new ImFile();
        file.setId(fileId);
        file.setConversationId(conversationId);
        file.setStatus(FileMetadataService.STATUS_AVAILABLE);
        return file;
    }

    private ImConversationMember member(Long userId, String role) {
        ImConversationMember member = new ImConversationMember();
        member.setId(userId);
        member.setConversationId(1L);
        member.setUserId(userId);
        member.setRole(role);
        member.setIsPinned(0);
        member.setIsMuted(0);
        return member;
    }

    private SysUser user(Long userId) {
        SysUser user = new SysUser();
        user.setId(userId);
        user.setNickname("用户" + userId);
        user.setSignature("签名" + userId);
        return user;
    }
}
