package com.im.server.service;

import com.im.common.entity.ImFile;
import com.im.common.exception.BusinessException;
import com.im.server.config.FileStorageProperties;
import com.im.server.service.storage.FileStorageClient;
import com.im.server.service.storage.FileStorageRouter;
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
 * 文件上传服务：处理聊天附件、图片、头像等小文件的直接上传。
 */
@Service
public class FileUploadService {

    private static final long AVATAR_MAX_SIZE = 5L * 1024 * 1024;

    private final FileMetadataService metadataService;
    private final FileStorageRouter storageRouter;
    private final FileStorageProperties properties;
    private final FileQuotaService quotaService;

    public FileUploadService(
            FileMetadataService metadataService,
            FileStorageRouter storageRouter,
            FileStorageProperties properties,
            FileQuotaService quotaService) {
        this.metadataService = metadataService;
        this.storageRouter = storageRouter;
        this.properties = properties;
        this.quotaService = quotaService;
    }

    /**
     * 上传独立图片（不关联会话）。
     *
     * @param file 图片文件
     * @param uploaderId 上传者 ID
     * @return 文件元数据
     */
    @Transactional
    public ImFile uploadStandaloneImage(MultipartFile file, Long uploaderId) {
        return uploadImage(file, uploaderId, null, false);
    }

    /**
     * 上传会话文件附件。
     *
     * @param file 文件
     * @param uploaderId 上传者 ID
     * @param conversationId 会话 ID
     * @return 文件元数据
     */
    @Transactional
    public ImFile uploadConversationFile(MultipartFile file, Long uploaderId, Long conversationId) {
        if (conversationId == null) {
            throw new BusinessException(400, "conversationId is required");
        }
        metadataService.assertConversationMember(uploaderId, conversationId);
        return uploadFile(file, uploaderId, conversationId, false);
    }

    /**
     * 上传会话图片。
     *
     * @param file 图片文件
     * @param uploaderId 上传者 ID
     * @param conversationId 会话 ID
     * @return 文件元数据
     */
    @Transactional
    public ImFile uploadConversationImage(MultipartFile file, Long uploaderId, Long conversationId) {
        if (conversationId == null) {
            throw new BusinessException(400, "conversationId is required");
        }
        metadataService.assertConversationMember(uploaderId, conversationId);
        return uploadImage(file, uploaderId, conversationId, false);
    }

    /**
     * 上传用户头像。
     *
     * @param file 头像文件
     * @param uploaderId 上传者 ID
     * @return 文件元数据
     */
    @Transactional
    public ImFile uploadAvatarFile(MultipartFile file, Long uploaderId) {
        return uploadImage(file, uploaderId, null, false, AVATAR_MAX_SIZE);
    }

    /**
     * 上传群头像。
     *
     * @param file 头像文件
     * @param uploaderId 上传者 ID
     * @param conversationId 会话 ID
     * @return 文件元数据
     */
    @Transactional
    public ImFile uploadGroupAvatarFile(MultipartFile file, Long uploaderId, Long conversationId) {
        if (conversationId == null) {
            throw new BusinessException(400, "conversationId is required");
        }
        return uploadImage(file, uploaderId, conversationId, false, AVATAR_MAX_SIZE);
    }

    /**
     * 静默删除已存储的文件对象（用于事务回滚后的清理）。
     *
     * @param file 文件元数据
     */
    public void discardStoredFileQuietly(ImFile file) {
        if (file == null || !StringUtils.hasText(file.getObjectKey())) {
            return;
        }
        FileStorageClient storageClient = storageRouter.clientFor(file.getStorageType(), file.getBucket());
        storageClient.deleteQuietly(file.getObjectKey());
    }

    private ImFile uploadImage(MultipartFile file, Long uploaderId, Long conversationId, boolean temporary) {
        return uploadImage(file, uploaderId, conversationId, temporary, properties.getSmallFileMaxSize());
    }

    private ImFile uploadImage(
            MultipartFile file,
            Long uploaderId,
            Long conversationId,
            boolean temporary,
            long maxSize) {
        String detectedContentType = validateImageUpload(file, maxSize);
        quotaService.assertCanStore(uploaderId, file.getSize());
        return storeFile(file, uploaderId, conversationId, temporary, true, detectedContentType);
    }

    private ImFile uploadFile(MultipartFile file, Long uploaderId, Long conversationId, boolean temporary) {
        validateFileUpload(file);
        quotaService.assertCanStore(uploaderId, file.getSize());
        return storeFile(file, uploaderId, conversationId, temporary, false, file.getContentType());
    }

    /**
     * 存储文件到对象存储并写入元数据。
     * <p>
     * 先写存储再写数据库；若数据库写入失败则删除已存储对象，避免产生孤儿文件。
     */
    private ImFile storeFile(
            MultipartFile file,
            Long uploaderId,
            Long conversationId,
            boolean temporary,
            boolean imageOnly,
            String contentType) {
        FileStorageClient storageClient = storageRouter.defaultClient();
        String originalName = safeName(file.getOriginalFilename());
        String objectKey = finalObjectKey(originalName);
        boolean stored = false;
        try {
            String sha256 = sha256(file);
            storageClient.save(objectKey, file);
            stored = true;
            return metadataService.createAvailableFile(
                    originalName,
                    objectKey,
                    file.getSize(),
                    contentType,
                    uploaderId,
                    conversationId,
                    sha256,
                    storageClient.storageType(),
                    storageClient.bucket(),
                    temporary,
                    temporary ? LocalDateTime.now().plusDays(properties.getRetentionDays()) : null);
        } catch (Exception e) {
            if (stored) {
                storageClient.deleteQuietly(objectKey);
            }
            if (e instanceof BusinessException businessException) {
                throw businessException;
            }
            throw new BusinessException(
                    500,
                    "Failed to upload " + (imageOnly ? "image" : "file"),
                    e);
        }
    }

    private String validateImageUpload(MultipartFile file, long maxSize) {
        validateUploadSize(file.getSize(), maxSize, "Image exceeds upload size limit");
        try {
            String detectedContentType = ImageTypeDetector.detect(file);
            if (!StringUtils.hasText(detectedContentType)) {
                throw new BusinessException(415, "Only PNG, JPEG, GIF, and WebP images are supported");
            }
            return detectedContentType;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(415, "Only image uploads are supported");
        }
    }

    private void validateFileUpload(MultipartFile file) {
        validateUploadSize(file.getSize(), properties.getSmallFileMaxSize(), "File must use multipart upload");
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
