package com.im.server.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.im.common.entity.ImFile;
import com.im.server.mapper.FileMapper;
import com.im.server.service.storage.FileStorageClient;
import com.im.server.service.storage.FileStorageRouter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 媒体保留策略服务：负责清理历史临时对象和退役已替换的头像。
 */
@Service
public class FileRetentionService {

    private final FileMetadataService metadataService;
    private final FileMapper fileMapper;
    private final FileStorageRouter storageRouter;

    public FileRetentionService(
            FileMetadataService metadataService,
            FileMapper fileMapper,
            FileStorageRouter storageRouter) {
        this.metadataService = metadataService;
        this.fileMapper = fileMapper;
        this.storageRouter = storageRouter;
    }

    /**
     * 清理已过期的临时文件（每次最多 200 条）。
     */
    @Transactional
    public void cleanupExpiredTemporaryFiles() {
        List<ImFile> expiredFiles = fileMapper.selectList(new LambdaQueryWrapper<ImFile>()
                .eq(ImFile::getTemporary, 1)
                .eq(ImFile::getStatus, FileMetadataService.STATUS_AVAILABLE)
                .lt(ImFile::getExpiresAt, LocalDateTime.now())
                .last("LIMIT 200"));
        for (ImFile imFile : expiredFiles) {
            FileStorageClient storageClient =
                    storageRouter.clientFor(imFile.getStorageType(), imFile.getBucket());
            storageClient.deleteQuietly(imFile.getObjectKey());
            metadataService.markExpired(imFile);
        }
    }

    /**
     * 退役指定文件：标记过期并删除存储对象。
     * <p>
     * 使用 REQUIRES_NEW 传播级别，确保在调用方事务回滚时文件清理仍然生效。
     *
     * @param fileId 文件 ID
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void retireFile(Long fileId) {
        ImFile imFile = fileId != null ? fileMapper.selectById(fileId) : null;
        if (imFile == null || !FileMetadataService.STATUS_AVAILABLE.equals(imFile.getStatus())) {
            return;
        }
        metadataService.markExpired(imFile);
        FileStorageClient storageClient =
                storageRouter.clientFor(imFile.getStorageType(), imFile.getBucket());
        storageClient.deleteQuietly(imFile.getObjectKey());
    }
}
