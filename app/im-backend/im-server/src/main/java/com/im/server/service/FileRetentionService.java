package com.im.server.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.im.common.entity.ImFile;
import com.im.server.mapper.FileMapper;
import com.im.server.service.storage.FileStorageClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Intent: FileRetentionService owns cleanup of expired temporary files and unfinished uploads.
 */
@Service
public class FileRetentionService {

    private final FileMetadataService metadataService;
    private final FileMapper fileMapper;
    private final FileStorageClient storageClient;

    public FileRetentionService(
            FileMetadataService metadataService,
            FileMapper fileMapper,
            FileStorageClient storageClient) {
        this.metadataService = metadataService;
        this.fileMapper = fileMapper;
        this.storageClient = storageClient;
    }

    @Transactional
    public void cleanupExpiredTemporaryFiles() {
        List<ImFile> expiredFiles = fileMapper.selectList(new LambdaQueryWrapper<ImFile>()
                .eq(ImFile::getTemporary, 1)
                .eq(ImFile::getStatus, FileMetadataService.STATUS_AVAILABLE)
                .lt(ImFile::getExpiresAt, LocalDateTime.now()));
        for (ImFile imFile : expiredFiles) {
            storageClient.deleteQuietly(imFile.getObjectKey());
            metadataService.markExpired(imFile);
        }
    }
}
