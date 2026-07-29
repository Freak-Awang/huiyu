package com.im.server.service;

import com.im.common.exception.BusinessException;
import com.im.server.config.FileStorageProperties;
import com.im.server.service.storage.FileStorageClient;
import com.im.server.service.storage.FileStorageRouter;
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

/**
 * 文件上传服务测试，验证会话图片/文件上传、头像上传、群头像上传及各种拒绝场景。
 *
 * <p>测试范围：FileUploadService 的 uploadConversationImage、uploadConversationFile、
 * uploadAvatarFile、uploadGroupAvatarFile 方法。</p>
 */
@ExtendWith(MockitoExtension.class)
class FileUploadServiceTest {

    @Mock
    private FileMetadataService metadataService;

    @Mock
    private FileStorageClient storageClient;

    @Mock
    private FileStorageRouter storageRouter;

    @Mock
    private FileStorageProperties properties;

    @Mock
    private FileQuotaService quotaService;

    @InjectMocks
    private FileUploadService fileUploadService;

    /**
     * 验证会话图片上传：校验会话成员身份→存储到 MinIO→创建文件元数据（持久化、会话绑定）。
     */
    @Test
    void conversationImageUploadIsPersistentAndConversationScoped() throws Exception {
        when(properties.getSmallFileMaxSize()).thenReturn(104857600L);
        mockImageUploadStorage();

        fileUploadService.uploadConversationImage(image("photo.png"), 10L, 20L);

        verify(metadataService).assertConversationMember(10L, 20L); // 校验会话成员
        verify(storageClient).save(anyString(), any());
        verify(metadataService).createAvailableFile(
                eq("photo.png"),
                anyString(),
                eq(8L),
                eq("image/png"),
                eq(10L),
                eq(20L), // conversationId 不为空
                anyString(),
                eq("minio"),
                eq("im-files"),
                eq(false),
                isNull());
    }

    /**
     * 验证头像上传：独立文件（conversationId=null），持久化存储。
     */
    @Test
    void avatarUploadIsPersistentStandaloneImage() throws Exception {
        mockImageUploadStorage();

        fileUploadService.uploadAvatarFile(image("avatar.png"), 10L);

        verify(storageClient).save(anyString(), any());
        verify(metadataService).createAvailableFile(
                eq("avatar.png"),
                anyString(),
                eq(8L),
                eq("image/png"),
                eq(10L),
                isNull(), // avatar 无 conversationId
                anyString(),
                eq("minio"),
                eq("im-files"),
                eq(false),
                isNull());
    }

    /**
     * 验证群头像上传：绑定会话 ID，持久化存储。
     */
    @Test
    void groupAvatarUploadIsPersistentAndConversationScoped() throws Exception {
        mockImageUploadStorage();

        fileUploadService.uploadGroupAvatarFile(image("group.png"), 10L, 20L);

        verify(storageClient).save(anyString(), any());
        verify(metadataService).createAvailableFile(
                eq("group.png"),
                anyString(),
                eq(8L),
                eq("image/png"),
                eq(10L),
                eq(20L),
                anyString(),
                eq("minio"),
                eq("im-files"),
                eq(false),
                isNull());
    }

    /**
     * 验证群头像超过 5MB 限制时抛出 BusinessException(413)。
     */
    @Test
    void groupAvatarRejectsImagesLargerThanFiveMegabytes() {
        MockMultipartFile oversized = new MockMultipartFile(
                "file", "large.png", "image/png", new byte[5 * 1024 * 1024 + 1]);

        assertThatThrownBy(() -> fileUploadService.uploadGroupAvatarFile(oversized, 10L, 20L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("Image exceeds upload size limit")
                .extracting("code")
                .isEqualTo(413);
    }

    /**
     * 验证会话文件上传接受非图片文件（如 PDF），正常存储并创建元数据。
     */
    @Test
    void conversationFileUploadAcceptsNonImageFile() throws Exception {
        when(properties.getSmallFileMaxSize()).thenReturn(104857600L);
        when(storageRouter.defaultClient()).thenReturn(storageClient);
        when(storageClient.storageType()).thenReturn("minio");
        when(storageClient.bucket()).thenReturn("im-files");

        fileUploadService.uploadConversationFile(file("report.pdf"), 10L, 20L);

        verify(metadataService).assertConversationMember(10L, 20L);
        verify(storageClient).save(anyString(), any());
        verify(metadataService).createAvailableFile(
                eq("report.pdf"),
                anyString(),
                eq(5L),
                eq("application/pdf"),
                eq(10L),
                eq(20L),
                anyString(),
                eq("minio"),
                eq("im-files"),
                eq(false),
                isNull());
    }

    /**
     * 验证 uploadConversationImage 拒绝非图片文件（如 PDF），返回 415。
     */
    @Test
    void conversationUploadRejectsNonImageFile() {
        when(properties.getSmallFileMaxSize()).thenReturn(104857600L);

        assertThatThrownBy(() -> fileUploadService.uploadConversationImage(file("report.pdf"), 10L, 20L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("Only PNG, JPEG, GIF, and WebP images are supported")
                .extracting("code")
                .isEqualTo(415);
    }

    /**
     * 验证上传空文件时抛出 BusinessException(400)。
     */
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
        when(storageRouter.defaultClient()).thenReturn(storageClient);
        when(storageClient.storageType()).thenReturn("minio");
        when(storageClient.bucket()).thenReturn("im-files");
    }

    private MockMultipartFile image(String name) {
        return new MockMultipartFile("file", name, "image/png",
                new byte[] {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A});
    }

    private MockMultipartFile file(String name) {
        return new MockMultipartFile("file", name, "application/pdf", "hello".getBytes());
    }
}
