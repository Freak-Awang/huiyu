package com.im.server.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.im.common.dto.FileUploadCompleteRequest;
import com.im.common.dto.FileUploadTaskCreateRequest;
import com.im.common.dto.FileUploadTaskVO;
import com.im.common.entity.ImFile;
import com.im.common.entity.ImFileUpload;
import com.im.common.entity.ImFileUploadPart;
import com.im.common.exception.BusinessException;
import com.im.server.config.FileStorageProperties;
import com.im.server.mapper.FileMapper;
import com.im.server.mapper.FileUploadMapper;
import com.im.server.mapper.FileUploadPartMapper;
import com.im.server.service.storage.FileStorageClient;
import com.im.server.service.storage.StoredObject;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Intent: FileUploadTaskService owns resumable multipart uploads and final composition.
 */
@Service
public class FileUploadTaskService {

    private static final String STATUS_UPLOADING = "UPLOADING";
    private static final String STATUS_COMPLETED = "COMPLETED";
    private static final String STATUS_UPLOADED = "UPLOADED";

    private final FileUploadMapper uploadMapper;
    private final FileUploadPartMapper uploadPartMapper;
    private final FileMapper fileMapper;
    private final FileMetadataService metadataService;
    private final FileStorageClient storageClient;
    private final FileStorageProperties properties;

    public FileUploadTaskService(
            FileUploadMapper uploadMapper,
            FileUploadPartMapper uploadPartMapper,
            FileMapper fileMapper,
            FileMetadataService metadataService,
            FileStorageClient storageClient,
            FileStorageProperties properties) {
        this.uploadMapper = uploadMapper;
        this.uploadPartMapper = uploadPartMapper;
        this.fileMapper = fileMapper;
        this.metadataService = metadataService;
        this.storageClient = storageClient;
        this.properties = properties;
    }

    @Transactional
    public FileUploadTaskVO createTask(FileUploadTaskCreateRequest request, Long uploaderId) {
        validateCreateRequest(request);
        metadataService.assertConversationMember(uploaderId, request.getConversationId());

        String sha256 = normalizeHash(firstText(request.getSha256(), request.getFileHash()));
        ImFile reusable = findReusableFile(request.getConversationId(), request.getFileSize(), sha256);
        if (reusable != null) {
            FileUploadTaskVO vo = new FileUploadTaskVO();
            vo.setFileExists(true);
            vo.setFileId(reusable.getId());
            vo.setChunkSize(properties.getChunkSize());
            vo.setChunkCount(0);
            vo.setUploadMode("second_transfer");
            vo.setStorageType(storageClient.storageType());
            vo.setUploadedParts(List.of());
            vo.setFile(metadataService.toFileVO(reusable));
            return vo;
        }

        Long chunkSize = Math.max(1L, properties.getChunkSize());
        int chunkCount = (int) Math.ceil((double) request.getFileSize() / chunkSize);
        String originalName = safeName(request.getFileName());
        String uploadId = "upload_" + UUID.randomUUID().toString().replace("-", "");
        String objectKey = finalObjectKey(originalName);

        ImFileUpload upload = new ImFileUpload();
        upload.setUploadId(uploadId);
        upload.setUploaderId(uploaderId);
        upload.setConversationId(request.getConversationId());
        upload.setFileName(originalName);
        upload.setFileSize(request.getFileSize());
        upload.setContentType(firstText(request.getContentType(), request.getMimeType()));
        upload.setSha256(sha256);
        upload.setChunkSize(chunkSize);
        upload.setTotalParts(chunkCount);
        upload.setStorageType(storageClient.storageType());
        upload.setBucket(storageClient.bucket());
        upload.setObjectKey(objectKey);
        upload.setStatus(STATUS_UPLOADING);
        upload.setCreateTime(LocalDateTime.now());
        upload.setUpdateTime(LocalDateTime.now());
        upload.setExpiresAt(LocalDateTime.now().plusHours(properties.getUploadRetentionHours()));
        uploadMapper.insert(upload);

        FileUploadTaskVO vo = new FileUploadTaskVO();
        vo.setUploadId(uploadId);
        vo.setFileExists(false);
        vo.setChunkSize(chunkSize);
        vo.setChunkCount(chunkCount);
        vo.setUploadMode("multipart");
        vo.setStorageType(storageClient.storageType());
        vo.setUploadedParts(List.of());
        return vo;
    }

    @Transactional
    public FileUploadTaskVO uploadPart(String uploadId, Integer partNumber, MultipartFile file, Long uploaderId) {
        ImFileUpload upload = getOwnedUpload(uploadId, uploaderId);
        assertUploading(upload);
        validatePart(upload, partNumber, file);

        ImFileUploadPart existing = findPart(uploadId, partNumber);
        if (existing != null) {
            return toTaskVO(upload);
        }

        String partObjectKey = chunkObjectKey(upload, partNumber);
        try {
            storageClient.saveChunk(partObjectKey, file);
        } catch (Exception e) {
            throw new BusinessException("Failed to upload chunk: " + e.getMessage());
        }

        ImFileUploadPart part = new ImFileUploadPart();
        part.setUploadId(uploadId);
        part.setPartNumber(partNumber);
        part.setPartSize(file.getSize());
        part.setObjectKey(partObjectKey);
        part.setStatus(STATUS_UPLOADED);
        part.setCreateTime(LocalDateTime.now());
        part.setUpdateTime(LocalDateTime.now());
        uploadPartMapper.insert(part);
        return toTaskVO(upload);
    }

    public FileUploadTaskVO getTaskParts(String uploadId, Long uploaderId) {
        return toTaskVO(getOwnedUpload(uploadId, uploaderId));
    }

    @Transactional
    public ImFile completeTask(String uploadId, FileUploadCompleteRequest request, Long uploaderId) {
        ImFileUpload upload = getOwnedUpload(uploadId, uploaderId);
        assertUploading(upload);
        List<ImFileUploadPart> parts = getParts(uploadId);
        if (parts.size() != upload.getTotalParts()) {
            throw new BusinessException(400, "Upload is missing chunks");
        }
        long uploadedSize = parts.stream().mapToLong(ImFileUploadPart::getPartSize).sum();
        if (uploadedSize != upload.getFileSize()) {
            throw new BusinessException(400, "Upload size mismatch");
        }
        List<String> partKeys = parts.stream()
                .sorted(Comparator.comparing(ImFileUploadPart::getPartNumber))
                .map(ImFileUploadPart::getObjectKey)
                .collect(Collectors.toList());

        try {
            storageClient.compose(upload.getObjectKey(), partKeys, upload.getFileSize(), upload.getContentType());
            String expectedHash = normalizeHash(firstText(request != null ? request.getSha256() : null, upload.getSha256()));
            if (StringUtils.hasText(expectedHash)) {
                String actualHash = sha256Stored(upload.getObjectKey());
                if (!expectedHash.equalsIgnoreCase(actualHash)) {
                    storageClient.deleteQuietly(upload.getObjectKey());
                    throw new BusinessException(400, "File checksum mismatch");
                }
                upload.setSha256(actualHash);
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("Failed to complete upload: " + e.getMessage());
        }

        ImFile file = metadataService.createAvailableFile(
                upload.getFileName(),
                upload.getObjectKey(),
                upload.getFileSize(),
                upload.getContentType(),
                uploaderId,
                upload.getConversationId(),
                upload.getSha256(),
                storageClient.storageType(),
                storageClient.bucket(),
                false,
                null);
        upload.setStatus(STATUS_COMPLETED);
        upload.setFileId(file.getId());
        upload.setUpdateTime(LocalDateTime.now());
        uploadMapper.updateById(upload);
        partKeys.forEach(storageClient::deleteQuietly);
        return file;
    }

    private void validateCreateRequest(FileUploadTaskCreateRequest request) {
        if (request == null) {
            throw new BusinessException(400, "Upload task request is required");
        }
        if (request.getConversationId() == null) {
            throw new BusinessException(400, "conversationId is required");
        }
        if (!StringUtils.hasText(request.getFileName())) {
            throw new BusinessException(400, "fileName is required");
        }
        if (request.getFileSize() == null || request.getFileSize() <= 0) {
            throw new BusinessException(400, "File is empty");
        }
        if (request.getFileSize() > properties.getMaxSize()) {
            throw new BusinessException(413, "File exceeds upload size limit");
        }
    }

    private void validatePart(ImFileUpload upload, Integer partNumber, MultipartFile file) {
        if (partNumber == null || partNumber < 1 || partNumber > upload.getTotalParts()) {
            throw new BusinessException(400, "Invalid part number");
        }
        if (file == null || file.isEmpty()) {
            throw new BusinessException(400, "Chunk is empty");
        }
        long maxPartSize = upload.getChunkSize();
        if (partNumber.equals(upload.getTotalParts())) {
            long previousBytes = upload.getChunkSize() * (upload.getTotalParts() - 1L);
            maxPartSize = upload.getFileSize() - previousBytes;
        }
        if (file.getSize() > maxPartSize) {
            throw new BusinessException(413, "Chunk exceeds expected size");
        }
    }

    private void assertUploading(ImFileUpload upload) {
        if (!STATUS_UPLOADING.equals(upload.getStatus())) {
            throw new BusinessException(400, "Upload task is not active");
        }
        if (upload.getExpiresAt() != null && upload.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new BusinessException(410, "Upload task has expired");
        }
    }

    private ImFileUpload getOwnedUpload(String uploadId, Long uploaderId) {
        ImFileUpload upload = uploadMapper.selectOne(new LambdaQueryWrapper<ImFileUpload>()
                .eq(ImFileUpload::getUploadId, uploadId)
                .eq(ImFileUpload::getUploaderId, uploaderId));
        if (upload == null) {
            throw new BusinessException(404, "Upload task not found");
        }
        return upload;
    }

    private ImFileUploadPart findPart(String uploadId, Integer partNumber) {
        return uploadPartMapper.selectOne(new LambdaQueryWrapper<ImFileUploadPart>()
                .eq(ImFileUploadPart::getUploadId, uploadId)
                .eq(ImFileUploadPart::getPartNumber, partNumber));
    }

    private List<ImFileUploadPart> getParts(String uploadId) {
        return uploadPartMapper.selectList(new LambdaQueryWrapper<ImFileUploadPart>()
                .eq(ImFileUploadPart::getUploadId, uploadId)
                .orderByAsc(ImFileUploadPart::getPartNumber));
    }

    private FileUploadTaskVO toTaskVO(ImFileUpload upload) {
        FileUploadTaskVO vo = new FileUploadTaskVO();
        vo.setUploadId(upload.getUploadId());
        vo.setFileExists(false);
        vo.setFileId(upload.getFileId());
        vo.setChunkSize(upload.getChunkSize());
        vo.setChunkCount(upload.getTotalParts());
        vo.setUploadMode("multipart");
        vo.setStorageType(upload.getStorageType());
        vo.setUploadedParts(getParts(upload.getUploadId()).stream()
                .map(ImFileUploadPart::getPartNumber)
                .collect(Collectors.toList()));
        if (upload.getFileId() != null) {
            vo.setFile(metadataService.toFileVO(metadataService.getById(upload.getFileId())));
        }
        return vo;
    }

    private ImFile findReusableFile(Long conversationId, Long fileSize, String sha256) {
        if (!StringUtils.hasText(sha256)) {
            return null;
        }
        return fileMapper.selectOne(new LambdaQueryWrapper<ImFile>()
                .eq(ImFile::getConversationId, conversationId)
                .eq(ImFile::getFileSize, fileSize)
                .eq(ImFile::getSha256, sha256)
                .eq(ImFile::getStatus, FileMetadataService.STATUS_AVAILABLE)
                .last("LIMIT 1"));
    }

    private String chunkObjectKey(ImFileUpload upload, Integer partNumber) {
        return "chunks/" + upload.getUploadId() + "/" + partNumber;
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

    private String firstText(String primary, String fallback) {
        return StringUtils.hasText(primary) ? primary : fallback;
    }

    private String normalizeHash(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String hash = value.trim();
        return hash.startsWith("sha256_") ? hash.substring("sha256_".length()) : hash;
    }

    private String sha256Stored(String objectKey) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[8192];
        StoredObject object = storageClient.open(objectKey, 0, null);
        try (InputStream input = object.getInputStream()) {
            int read;
            while ((read = input.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }
}
