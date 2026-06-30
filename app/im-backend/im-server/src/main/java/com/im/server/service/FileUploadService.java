package com.im.server.service;

import com.im.common.entity.ImFile;
import com.im.common.exception.BusinessException;
import com.im.server.config.FileStorageProperties;
import com.im.server.service.storage.FileStorageClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Intent: FileUploadService owns media uploads that remain after chat file attachments were removed.
 */
@Service
public class FileUploadService {

    private final FileMetadataService metadataService;
    private final FileStorageClient storageClient;
    private final FileStorageProperties properties;

    public FileUploadService(
            FileMetadataService metadataService,
            FileStorageClient storageClient,
            FileStorageProperties properties) {
        this.metadataService = metadataService;
        this.storageClient = storageClient;
        this.properties = properties;
    }

    @Transactional
    public ImFile uploadStandaloneImage(MultipartFile file, Long uploaderId) {
        return uploadImage(file, uploaderId, null, false);
    }

    @Transactional
    public ImFile uploadConversationImage(MultipartFile file, Long uploaderId, Long conversationId) {
        if (conversationId == null) {
            throw new BusinessException(400, "conversationId is required");
        }
        metadataService.assertConversationMember(uploaderId, conversationId);
        return uploadImage(file, uploaderId, conversationId, false);
    }

    @Transactional
    public ImFile uploadAvatarFile(MultipartFile file, Long uploaderId) {
        return uploadImage(file, uploaderId, null, false);
    }

    private ImFile uploadImage(MultipartFile file, Long uploaderId, Long conversationId, boolean temporary) {
        validateImageUpload(file);
        try {
            String originalName = safeName(file.getOriginalFilename());
            String objectKey = finalObjectKey(originalName);
            storageClient.save(objectKey, file);
            return metadataService.createAvailableFile(
                    originalName,
                    objectKey,
                    file.getSize(),
                    file.getContentType(),
                    uploaderId,
                    conversationId,
                    null,
                    storageClient.storageType(),
                    storageClient.bucket(),
                    temporary,
                    temporary ? LocalDateTime.now().plusDays(properties.getRetentionDays()) : null);
        } catch (Exception e) {
            throw new BusinessException("Failed to upload file: " + e.getMessage());
        }
    }

    private void validateImageUpload(MultipartFile file) {
        validateUploadSize(file.getSize(), properties.getSmallFileMaxSize(), "Image exceeds upload size limit");
        String contentType = file.getContentType();
        if (!StringUtils.hasText(contentType) || !contentType.startsWith("image/")) {
            throw new BusinessException(415, "Only image uploads are supported");
        }
    }

    private void validateUploadSize(long size, long maxSize, String message) {
        if (size <= 0) {
            throw new BusinessException(400, "File is empty");
        }
        if (size > maxSize) {
            throw new BusinessException(413, message);
        }
    }

    private String finalObjectKey(String originalName) {
        String extension = "";
        int dot = originalName.lastIndexOf('.');
        if (dot >= 0) {
            extension = originalName.substring(dot);
        }
        return "files/" + LocalDateTime.now().toLocalDate() + "/" + UUID.randomUUID() + extension;
    }

    private String safeName(String name) {
        String value = StringUtils.hasText(name) ? name : "file";
        return value.replace("\\", "_").replace("/", "_");
    }

}
