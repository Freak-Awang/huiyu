package com.im.server.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.im.common.entity.ImConversationMember;
import com.im.common.entity.ImFile;
import com.im.common.entity.SysUser;
import com.im.common.exception.BusinessException;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.service.storage.FileStorageClient;
import com.im.server.service.storage.FileStorageRouter;
import com.im.server.service.storage.StoredObject;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * Intent: FileDownloadService owns download authorization, storage reads, and download counters.
 */
@Service
public class FileDownloadService {

    private final FileMetadataService metadataService;
    private final ConversationMemberMapper conversationMemberMapper;
    private final UserMapper userMapper;
    private final FileStorageRouter storageRouter;

    public FileDownloadService(
            FileMetadataService metadataService,
            ConversationMemberMapper conversationMemberMapper,
            UserMapper userMapper,
            FileStorageRouter storageRouter) {
        this.metadataService = metadataService;
        this.conversationMemberMapper = conversationMemberMapper;
        this.userMapper = userMapper;
        this.storageRouter = storageRouter;
    }

    public ImFile getDownloadableFile(Long userId, Long fileId) {
        ImFile imFile = metadataService.getById(fileId);
        if (imFile == null) {
            throw new BusinessException(404, "File not found");
        }
        if (!FileMetadataService.STATUS_AVAILABLE.equals(imFile.getStatus())) {
            throw new BusinessException(410, "File is not available");
        }
        if (imFile.getExpiresAt() != null && imFile.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new BusinessException(410, "File has expired");
        }
        if (!canAccessFile(userId, imFile)) {
            throw new BusinessException(403, "No permission to download this file");
        }
        return imFile;
    }

    public long getFileSize(Long fileId) {
        ImFile file = metadataService.getById(fileId);
        return file != null && file.getFileSize() != null ? file.getFileSize() : 0L;
    }

    public StoredObject openFile(ImFile file, long offset, Long length) {
        try {
            FileStorageClient storageClient = storageRouter.clientFor(file.getStorageType(), file.getBucket());
            return storageClient.open(file.getObjectKey(), offset, length);
        } catch (Exception e) {
            throw new BusinessException("Failed to open file: " + e.getMessage());
        }
    }

    public void incrementDownloadCount(Long fileId) {
        metadataService.incrementDownloadCount(fileId);
    }

    private boolean canAccessFile(Long userId, ImFile imFile) {
        if (isPublicStandaloneFile(imFile)) {
            return true;
        }
        if (userId == null) {
            return false;
        }
        if (userId.equals(imFile.getUploaderId())) {
            return true;
        }
        SysUser user = userMapper.selectById(userId);
        if (user != null && "admin".equalsIgnoreCase(user.getRole())) {
            return true;
        }
        if (imFile.getConversationId() == null) {
            return false;
        }
        return conversationMemberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, imFile.getConversationId())
                .eq(ImConversationMember::getUserId, userId)) != null;
    }

    private boolean isPublicStandaloneFile(ImFile imFile) {
        return imFile.getConversationId() == null && Integer.valueOf(0).equals(imFile.getTemporary());
    }
}
