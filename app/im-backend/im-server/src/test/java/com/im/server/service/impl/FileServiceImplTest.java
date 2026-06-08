package com.im.server.service.impl;

import com.im.common.dto.FileTransferInitRequest;
import com.im.common.dto.FileTransferStatusRequest;
import com.im.common.dto.FileTransferVO;
import com.im.common.entity.ImConversation;
import com.im.common.entity.ImConversationMember;
import com.im.common.entity.ImFile;
import com.im.common.entity.ImFileTransfer;
import com.im.common.exception.BusinessException;
import com.im.server.config.FileStorageProperties;
import com.im.server.mapper.ConversationMapper;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.FileMapper;
import com.im.server.mapper.FileTransferMapper;
import com.im.server.mapper.FileUploadMapper;
import com.im.server.mapper.FileUploadPartMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.service.storage.FileStorageClient;
import com.im.server.websocket.WebSocketSessionManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FileServiceImplTest {

    @Mock
    private FileMapper fileMapper;

    @Mock
    private FileTransferMapper transferMapper;

    @Mock
    private FileUploadMapper uploadMapper;

    @Mock
    private FileUploadPartMapper uploadPartMapper;

    @Mock
    private ConversationMapper conversationMapper;

    @Mock
    private ConversationMemberMapper conversationMemberMapper;

    @Mock
    private UserMapper userMapper;

    @Mock
    private FileStorageClient storageClient;

    @Mock
    private FileStorageProperties properties;

    @Mock
    private WebSocketSessionManager sessionManager;

    @InjectMocks
    private FileServiceImpl fileService;

    @Test
    void anonymousUserCanDownloadPublicStandaloneFile() {
        ImFile avatar = availableFile(1L);
        avatar.setConversationId(null);
        avatar.setTemporary(0);
        when(fileMapper.selectById(1L)).thenReturn(avatar);

        ImFile result = fileService.getDownloadableFile(null, 1L);

        assertThat(result).isSameAs(avatar);
    }

    @Test
    void anonymousUserCannotDownloadConversationFile() {
        ImFile conversationFile = availableFile(2L);
        conversationFile.setConversationId(10L);
        conversationFile.setTemporary(0);
        when(fileMapper.selectById(2L)).thenReturn(conversationFile);

        assertThatThrownBy(() -> fileService.getDownloadableFile(null, 2L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("No permission to download this file")
                .extracting("code")
                .isEqualTo(403);
    }

    @Test
    void singleChatOnlineLargeFileUsesP2p() {
        mockTransferValidation(1, true);

        FileTransferVO result = fileService.initTransfer(10L, transferRequest(false, "AUTO"));

        assertThat(result.getMode()).isEqualTo("P2P");
        assertThat(result.getStatus()).isEqualTo("P2P_NEGOTIATING");
        assertThat(result.getReceiverOnline()).isTrue();
    }

    @Test
    void groupLargeFileUsesServer() {
        mockTransferValidation(2, true);

        FileTransferVO result = fileService.initTransfer(10L, transferRequest(false, "AUTO"));

        assertThat(result.getMode()).isEqualTo("SERVER");
        assertThat(result.getStatus()).isEqualTo("WAITING_UPLOAD");
        assertThat(result.getFallbackReason()).isEqualTo("group files use file center");
    }

    @Test
    void offlineReceiverUsesServer() {
        mockTransferValidation(1, false);

        FileTransferVO result = fileService.initTransfer(10L, transferRequest(false, "AUTO"));

        assertThat(result.getMode()).isEqualTo("SERVER");
        assertThat(result.getFallbackReason()).isEqualTo("receiver offline");
    }

    @Test
    void archiveRequiredUsesServer() {
        mockTransferValidation(1, true);

        FileTransferVO result = fileService.initTransfer(10L, transferRequest(true, "AUTO"));

        assertThat(result.getMode()).isEqualTo("SERVER");
        assertThat(result.getFallbackReason()).isEqualTo("archive required");
    }

    @Test
    void fallbackTransferSwitchesToServerUpload() {
        ImFileTransfer transfer = new ImFileTransfer();
        transfer.setTransferId("transfer-1");
        transfer.setSenderId(10L);
        transfer.setConversationId(20L);
        transfer.setFileName("large.bin");
        transfer.setFileSize(200L * 1024L * 1024L);
        transfer.setMode("P2P");
        transfer.setStatus("P2P_TRANSFERRING");
        when(transferMapper.selectOne(any())).thenReturn(transfer);

        FileTransferStatusRequest request = new FileTransferStatusRequest();
        request.setFallbackReason("timeout");
        FileTransferVO result = fileService.fallbackTransfer(10L, "transfer-1", request);

        assertThat(result.getMode()).isEqualTo("SERVER");
        assertThat(result.getStatus()).isEqualTo("FALLBACK_UPLOAD");
        assertThat(result.getFallbackReason()).isEqualTo("timeout");
        ArgumentCaptor<ImFileTransfer> captor = ArgumentCaptor.forClass(ImFileTransfer.class);
        verify(transferMapper).updateById(captor.capture());
        assertThat(captor.getValue().getMode()).isEqualTo("SERVER");
    }

    private ImFile availableFile(Long id) {
        ImFile file = new ImFile();
        file.setId(id);
        file.setStatus("AVAILABLE");
        file.setUploaderId(10L);
        return file;
    }

    private void mockTransferValidation(int conversationType, boolean receiverOnline) {
        when(properties.getMaxSize()).thenReturn(53687091200L);
        lenient().when(properties.getSmallFileMaxSize()).thenReturn(104857600L);
        when(properties.getRetentionDays()).thenReturn(7);
        when(conversationMemberMapper.selectOne(any())).thenReturn(member(20L, 10L));

        ImConversation conversation = new ImConversation();
        conversation.setId(20L);
        conversation.setType(conversationType);
        lenient().when(conversationMapper.selectById(20L)).thenReturn(conversation);
        lenient().when(conversationMemberMapper.selectList(any())).thenReturn(java.util.List.of(
                member(20L, 10L),
                member(20L, 11L)));
        lenient().when(sessionManager.isOnline(11L)).thenReturn(receiverOnline);
    }

    private FileTransferInitRequest transferRequest(boolean archiveRequired, String preferredMode) {
        FileTransferInitRequest request = new FileTransferInitRequest();
        request.setConversationId(20L);
        request.setReceiverId(11L);
        request.setFileName("large.bin");
        request.setFileSize(200L * 1024L * 1024L);
        request.setPreferredMode(preferredMode);
        request.setArchiveRequired(archiveRequired);
        return request;
    }

    private ImConversationMember member(Long conversationId, Long userId) {
        ImConversationMember member = new ImConversationMember();
        member.setConversationId(conversationId);
        member.setUserId(userId);
        return member;
    }
}
