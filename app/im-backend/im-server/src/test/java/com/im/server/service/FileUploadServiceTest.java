package com.im.server.service;

import com.im.common.exception.BusinessException;
import com.im.server.config.FileStorageProperties;
import com.im.server.service.storage.FileStorageClient;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FileUploadServiceTest {

    @Mock
    private FileMetadataService metadataService;

    @Mock
    private FileStorageClient storageClient;

    @Mock
    private FileStorageProperties properties;

    @InjectMocks
    private FileUploadService fileUploadService;

    @Test
    void conversationImageUploadIsPersistentAndConversationScoped() throws Exception {
        mockImageUploadStorage();

        fileUploadService.uploadConversationImage(image("photo.png"), 10L, 20L);

        verify(metadataService).assertConversationMember(10L, 20L);
        verify(storageClient).save(anyString(), any());
        verify(metadataService).createAvailableFile(
                eq("photo.png"),
                anyString(),
                eq(5L),
                eq("image/png"),
                eq(10L),
                eq(20L),
                isNull(),
                eq("minio"),
                eq("im-files"),
                eq(false),
                isNull());
    }

    @Test
    void avatarUploadIsPersistentStandaloneImage() throws Exception {
        mockImageUploadStorage();

        fileUploadService.uploadAvatarFile(image("avatar.png"), 10L);

        verify(storageClient).save(anyString(), any());
        verify(metadataService).createAvailableFile(
                eq("avatar.png"),
                anyString(),
                eq(5L),
                eq("image/png"),
                eq(10L),
                isNull(),
                isNull(),
                eq("minio"),
                eq("im-files"),
                eq(false),
                isNull());
    }

    @Test
    void conversationUploadRejectsNonImageFile() {
        when(properties.getSmallFileMaxSize()).thenReturn(104857600L);

        assertThatThrownBy(() -> fileUploadService.uploadConversationImage(file("report.pdf"), 10L, 20L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("Only image uploads are supported")
                .extracting("code")
                .isEqualTo(415);
    }

    @Test
    void imageUploadRejectsEmptyFile() {
        when(properties.getSmallFileMaxSize()).thenReturn(104857600L);

        assertThatThrownBy(() -> fileUploadService.uploadConversationImage(
                new MockMultipartFile("file", "empty.png", "image/png", new byte[0]), 10L, 20L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("File is empty")
                .extracting("code")
                .isEqualTo(400);
    }

    private void mockImageUploadStorage() {
        when(properties.getSmallFileMaxSize()).thenReturn(104857600L);
        when(storageClient.storageType()).thenReturn("minio");
        when(storageClient.bucket()).thenReturn("im-files");
    }

    private MockMultipartFile image(String name) {
        return new MockMultipartFile("file", name, "image/png", "hello".getBytes());
    }

    private MockMultipartFile file(String name) {
        return new MockMultipartFile("file", name, "application/pdf", "hello".getBytes());
    }
}
