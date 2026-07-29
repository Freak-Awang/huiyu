package com.im.server.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.im.common.entity.ImFile;
import com.im.common.entity.ImFileUpload;
import com.im.common.entity.ImFileUploadPart;
import com.im.server.mapper.FileMapper;
import com.im.server.mapper.FileUploadMapper;
import com.im.server.mapper.FileUploadPartMapper;
import com.im.server.service.storage.FileStorageClient;
import com.im.server.service.storage.FileStorageRouter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
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
    private final FileStorageRouter storageRouter;
    private final FileUploadMapper uploadMapper;
    private final FileUploadPartMapper uploadPartMapper;

    public FileRetentionService(
            FileMetadataService metadataService,
            FileMapper fileMapper,
            FileStorageRouter storageRouter,
            FileUploadMapper uploadMapper,
            FileUploadPartMapper uploadPartMapper) {
        this.metadataService = metadataService;
        this.fileMapper = fileMapper;
        this.storageRouter = storageRouter;
        this.uploadMapper = uploadMapper;
        this.uploadPartMapper = uploadPartMapper;
    }

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

    @Transactional
    public void cleanupExpiredUploadTasks() {
        List<ImFileUpload> expiredUploads = uploadMapper.selectList(
                new LambdaQueryWrapper<ImFileUpload>()
                        .eq(ImFileUpload::getStatus, "UPLOADING")
                        .lt(ImFileUpload::getExpiresAt, LocalDateTime.now())
                        .last("LIMIT 100"));
        for (ImFileUpload upload : expiredUploads) {
            FileStorageClient storageClient =
                    storageRouter.clientFor(upload.getStorageType(), upload.getBucket());
            List<ImFileUploadPart> parts = uploadPartMapper.selectList(
                    new LambdaQueryWrapper<ImFileUploadPart>()
                            .eq(ImFileUploadPart::getUploadId, upload.getUploadId()));
            parts.forEach(part -> storageClient.deleteQuietly(part.getObjectKey()));
            storageClient.deleteQuietly(upload.getObjectKey());
            uploadPartMapper.delete(new LambdaQueryWrapper<ImFileUploadPart>()
                    .eq(ImFileUploadPart::getUploadId, upload.getUploadId()));
            upload.setStatus("ABORTED");
            upload.setUpdateTime(LocalDateTime.now());
            uploadMapper.updateById(upload);
        }
    }

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
