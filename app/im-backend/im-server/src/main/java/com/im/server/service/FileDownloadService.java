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
 * 文件下载服务：负责下载权限校验、存储读取及下载计数。
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

    /**
     * 获取可下载的文件元数据，校验文件存在、可用、未过期且用户有权限。
     *
     * @param userId 下载用户 ID，可为空（匿名下载公开文件）
     * @param fileId 文件 ID
     * @return 文件元数据
     * @throws BusinessException 文件不存在、不可用、已过期或无权限时抛出
     */
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

    /**
     * 获取文件大小。
     *
     * @param fileId 文件 ID
     * @return 文件字节数，文件不存在时返回 0
     */
    public long getFileSize(Long fileId) {
        ImFile file = metadataService.getById(fileId);
        return file != null && file.getFileSize() != null ? file.getFileSize() : 0L;
    }

    /**
     * 打开文件流，支持 Range 分片读取。
     *
     * @param file 文件元数据
     * @param offset 起始偏移量
     * @param length 读取长度，null 表示读到末尾
     * @return 存储对象
     * @throws BusinessException 存储读取失败时抛出
     */
    public StoredObject openFile(ImFile file, long offset, Long length) {
        try {
            FileStorageClient storageClient = storageRouter.clientFor(file.getStorageType(), file.getBucket());
            return storageClient.open(file.getObjectKey(), offset, length);
        } catch (Exception e) {
            throw new BusinessException(500, "Failed to open file", e);
        }
    }

    /**
     * 增加文件下载计数。
     *
     * @param fileId 文件 ID
     */
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
        if (imFile.getConversationId() != null || !Integer.valueOf(0).equals(imFile.getTemporary())) {
            return false;
        }
        String downloadPath = "/api/files/download/" + imFile.getId();
        return userMapper.selectCount(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getAvatar, downloadPath)) > 0;
    }
}
