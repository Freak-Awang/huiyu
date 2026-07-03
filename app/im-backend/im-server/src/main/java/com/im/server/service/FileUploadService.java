package com.im.server.service;

import com.im.common.entity.ImFile;
import com.im.common.exception.BusinessException;
import com.im.server.config.FileStorageProperties;
import com.im.server.service.storage.FileStorageClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.UUID;

/**
 * Intent: FileUploadService owns direct uploads for chat attachments, images, and avatars.
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
    public ImFile uploadConversationFile(MultipartFile file, Long uploaderId, Long conversationId) {
        if (conversationId == null) {
            throw new BusinessException(400, "conversationId is required");
        }
        metadataService.assertConversationMember(uploaderId, conversationId);
        return uploadFile(file, uploaderId, conversationId, false);
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
        return storeFile(file, uploaderId, conversationId, temporary, true);
    }

    private ImFile uploadFile(MultipartFile file, Long uploaderId, Long conversationId, boolean temporary) {
        validateFileUpload(file);
        return storeFile(file, uploaderId, conversationId, temporary, false);
    }

    private ImFile storeFile(MultipartFile file, Long uploaderId, Long conversationId, boolean temporary, boolean imageOnly) {
        try {
            String originalName = safeName(file.getOriginalFilename());
            String objectKey = finalObjectKey(originalName);
            String sha256 = sha256(file);
            storageClient.save(objectKey, file);
            return metadataService.createAvailableFile(
                    originalName,
                    objectKey,
                    file.getSize(),
                    file.getContentType(),
                    uploaderId,
                    conversationId,
                    sha256,
                    storageClient.storageType(),
                    storageClient.bucket(),
                    temporary,
                    temporary ? LocalDateTime.now().plusDays(properties.getRetentionDays()) : null);
        } catch (Exception e) {
            throw new BusinessException("Failed to upload " + (imageOnly ? "image" : "file") + ": " + e.getMessage());
        }
    }

    private void validateImageUpload(MultipartFile file) {
        validateUploadSize(file.getSize(), properties.getSmallFileMaxSize(), "Image exceeds upload size limit");
        String contentType = file.getContentType();
        if (!StringUtils.hasText(contentType) || !contentType.startsWith("image/")) {
            throw new BusinessException(415, "Only image uploads are supported");
        }
    }

    private void validateFileUpload(MultipartFile file) {
        validateUploadSize(file.getSize(), properties.getMaxSize(), "File exceeds upload size limit");
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

    private String sha256(MultipartFile file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[8192];
        try (InputStream input = file.getInputStream()) {
            int read;
            while ((read = input.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }

}
