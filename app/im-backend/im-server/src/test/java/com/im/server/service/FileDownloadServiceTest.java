package com.im.server.service;

import com.im.common.entity.ImFile;
import com.im.common.exception.BusinessException;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.service.storage.FileStorageClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FileDownloadServiceTest {

    @Mock
    private FileMetadataService metadataService;

    @Mock
    private ConversationMemberMapper conversationMemberMapper;

    @Mock
    private UserMapper userMapper;

    @Mock
    private FileStorageClient storageClient;

    @InjectMocks
    private FileDownloadService fileDownloadService;

    @Test
    void anonymousUserCanDownloadPublicStandaloneFile() {
        ImFile avatar = availableFile(1L);
        avatar.setConversationId(null);
        avatar.setTemporary(0);
        when(metadataService.getById(1L)).thenReturn(avatar);

        ImFile result = fileDownloadService.getDownloadableFile(null, 1L);

        assertThat(result).isSameAs(avatar);
    }

    @Test
    void anonymousUserCannotDownloadConversationFile() {
        ImFile conversationFile = availableFile(2L);
        conversationFile.setConversationId(10L);
        conversationFile.setTemporary(0);
        when(metadataService.getById(2L)).thenReturn(conversationFile);

        assertThatThrownBy(() -> fileDownloadService.getDownloadableFile(null, 2L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("No permission to download this file")
                .extracting("code")
                .isEqualTo(403);
    }

    private ImFile availableFile(Long id) {
        ImFile file = new ImFile();
        file.setId(id);
        file.setStatus(FileMetadataService.STATUS_AVAILABLE);
        file.setUploaderId(10L);
        return file;
    }
}
