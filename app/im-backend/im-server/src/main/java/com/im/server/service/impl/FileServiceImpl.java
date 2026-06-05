package com.im.server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.common.dto.FileTransferInitRequest;
import com.im.common.dto.FileTransferVO;
import com.im.common.dto.FileUploadCompleteRequest;
import com.im.common.dto.FileUploadInitRequest;
import com.im.common.dto.FileUploadVO;
import com.im.common.dto.FileVO;
import com.im.common.entity.ImConversationMember;
import com.im.common.entity.ImFile;
import com.im.common.entity.ImFileTransfer;
import com.im.common.entity.ImFileUpload;
import com.im.common.entity.ImFileUploadPart;
import com.im.common.entity.SysUser;
import com.im.common.exception.BusinessException;
import com.im.common.result.PageResult;
import com.im.server.config.FileStorageProperties;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.FileMapper;
import com.im.server.mapper.FileTransferMapper;
import com.im.server.mapper.FileUploadMapper;
import com.im.server.mapper.FileUploadPartMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.service.FileService;
import com.im.server.service.storage.FileStorageClient;
import com.im.server.service.storage.StoredObject;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class FileServiceImpl implements FileService {

    private static final String STATUS_AVAILABLE = "AVAILABLE";
    private static final String STATUS_UPLOADING = "UPLOADING";
    private static final String STATUS_COMPLETED = "COMPLETED";
    private static final String STATUS_ABORTED = "ABORTED";
    private static final String STATUS_EXPIRED = "EXPIRED";
    private static final String PART_STATUS_UPLOADED = "UPLOADED";

    private final FileMapper fileMapper;
    private final FileTransferMapper transferMapper;
    private final FileUploadMapper uploadMapper;
    private final FileUploadPartMapper uploadPartMapper;
    private final ConversationMemberMapper conversationMemberMapper;
    private final UserMapper userMapper;
    private final FileStorageClient storageClient;
    private final FileStorageProperties properties;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public FileServiceImpl(
            FileMapper fileMapper,
            FileTransferMapper transferMapper,
            FileUploadMapper uploadMapper,
            FileUploadPartMapper uploadPartMapper,
            ConversationMemberMapper conversationMemberMapper,
            UserMapper userMapper,
            FileStorageClient storageClient,
            FileStorageProperties properties) {
        this.fileMapper = fileMapper;
        this.transferMapper = transferMapper;
        this.uploadMapper = uploadMapper;
        this.uploadPartMapper = uploadPartMapper;
        this.conversationMemberMapper = conversationMemberMapper;
        this.userMapper = userMapper;
        this.storageClient = storageClient;
        this.properties = properties;
    }

    @Override
    public ImFile upload(MultipartFile file, Long uploaderId) {
        return upload(file, uploaderId, null, true);
    }

    @Override
    public ImFile upload(MultipartFile file, Long uploaderId, boolean temporary) {
        return upload(file, uploaderId, null, temporary);
    }

    @Override
    @Transactional
    public ImFile upload(MultipartFile file, Long uploaderId, Long conversationId, boolean temporary) {
        validateUploadSize(file.getSize(), properties.getSmallFileMaxSize(), "Files larger than 100MB must use chunked upload");
        if (conversationId != null) {
            assertConversationMember(uploaderId, conversationId);
        }
        try {
            String originalName = safeName(file.getOriginalFilename());
            String objectKey = finalObjectKey(originalName);
            storageClient.save(objectKey, file);

            ImFile imFile = new ImFile();
            imFile.setOriginalName(originalName);
            imFile.setStoredName(objectKey.substring(objectKey.lastIndexOf('/') + 1));
            imFile.setFilePath(objectKey);
            imFile.setFileSize(file.getSize());
            imFile.setContentType(file.getContentType());
            imFile.setUploaderId(uploaderId);
            imFile.setConversationId(conversationId);
            imFile.setStorageType(storageClient.storageType());
            imFile.setBucket(storageClient.bucket());
            imFile.setObjectKey(objectKey);
            imFile.setStatus(STATUS_AVAILABLE);
            imFile.setDownloadCount(0);
            imFile.setCreateTime(LocalDateTime.now());
            boolean temporaryFile = temporary && conversationId == null;
            imFile.setTemporary(temporaryFile ? 1 : 0);
            imFile.setExpiresAt(temporaryFile ? LocalDateTime.now().plusDays(properties.getRetentionDays()) : null);
            fileMapper.insert(imFile);
            return imFile;
        } catch (Exception e) {
            throw new BusinessException("Failed to upload file: " + e.getMessage());
        }
    }

    @Override
    public ImFile getById(Long id) {
        return fileMapper.selectById(id);
    }

    @Override
    @Transactional
    public FileTransferVO initTransfer(Long userId, FileTransferInitRequest request) {
        validateTransferRequest(userId, request.getConversationId(), request.getFileName(), request.getFileSize());

        ImFileTransfer transfer = new ImFileTransfer();
        transfer.setTransferId(UUID.randomUUID().toString());
        transfer.setSenderId(userId);
        transfer.setConversationId(request.getConversationId());
        transfer.setFileName(safeName(request.getFileName()));
        transfer.setFileSize(request.getFileSize());
        transfer.setContentType(request.getContentType());
        transfer.setSha256(normalizeSha256(request.getSha256()));
        transfer.setMode(StringUtils.hasText(request.getMode()) ? request.getMode() : "SERVER");
        transfer.setStatus("WAITING_UPLOAD");
        transfer.setCreateTime(LocalDateTime.now());
        transfer.setUpdateTime(LocalDateTime.now());
        transfer.setExpiresAt(LocalDateTime.now().plusDays(properties.getRetentionDays()));

        ImFile instantFile = findReusableFile(transfer.getSha256(), request.getFileSize(), userId, request.getConversationId());
        if (instantFile != null) {
            transfer.setStatus(STATUS_COMPLETED);
            transfer.setFileId(instantFile.getId());
        }
        transferMapper.insert(transfer);
        return toTransferVO(transfer);
    }

    @Override
    @Transactional
    public FileUploadVO initUpload(Long userId, FileUploadInitRequest request) {
        validateTransferRequest(userId, request.getConversationId(), request.getFileName(), request.getFileSize());
        String sha256 = normalizeSha256(request.getSha256());
        ImFile instantFile = findReusableFile(sha256, request.getFileSize(), userId, request.getConversationId());
        if (instantFile != null) {
            FileUploadVO vo = new FileUploadVO();
            vo.setInstant(true);
            vo.setStatus(STATUS_COMPLETED);
            vo.setFile(toFileVO(instantFile));
            vo.setUploadedParts(List.of());
            vo.setChunkSize(properties.getChunkSize());
            vo.setTotalParts(0);
            return vo;
        }

        ImFileUpload upload = new ImFileUpload();
        upload.setUploadId(UUID.randomUUID().toString());
        upload.setTransferId(request.getTransferId());
        upload.setUploaderId(userId);
        upload.setConversationId(request.getConversationId());
        upload.setFileName(safeName(request.getFileName()));
        upload.setFileSize(request.getFileSize());
        upload.setContentType(request.getContentType());
        upload.setSha256(sha256);
        upload.setChunkSize(properties.getChunkSize());
        upload.setTotalParts((int) Math.ceil((double) request.getFileSize() / properties.getChunkSize()));
        upload.setStorageType(storageClient.storageType());
        upload.setBucket(storageClient.bucket());
        upload.setObjectKey(finalObjectKey(upload.getFileName()));
        upload.setStatus(STATUS_UPLOADING);
        upload.setCreateTime(LocalDateTime.now());
        upload.setUpdateTime(LocalDateTime.now());
        upload.setExpiresAt(LocalDateTime.now().plusHours(properties.getUploadRetentionHours()));
        uploadMapper.insert(upload);
        return toUploadVO(upload);
    }

    @Override
    public FileUploadVO getUploadStatus(Long userId, String uploadId) {
        ImFileUpload upload = getOwnedUpload(userId, uploadId);
        return toUploadVO(upload);
    }

    @Override
    @Transactional
    public FileUploadVO uploadChunk(Long userId, String uploadId, Integer partNumber, MultipartFile file) {
        ImFileUpload upload = getOwnedUpload(userId, uploadId);
        if (!STATUS_UPLOADING.equals(upload.getStatus())) {
            throw new BusinessException("Upload is not active");
        }
        if (partNumber == null || partNumber < 1 || partNumber > upload.getTotalParts()) {
            throw new BusinessException(400, "Invalid part number");
        }
        long expectedMax = upload.getChunkSize();
        if (file.getSize() > expectedMax) {
            throw new BusinessException(413, "Chunk exceeds configured size");
        }

        String chunkKey = "chunks/" + uploadId + "/" + partNumber;
        try {
            storageClient.saveChunk(chunkKey, file);
        } catch (Exception e) {
            throw new BusinessException("Failed to upload chunk: " + e.getMessage());
        }

        ImFileUploadPart existing = uploadPartMapper.selectOne(new LambdaQueryWrapper<ImFileUploadPart>()
                .eq(ImFileUploadPart::getUploadId, uploadId)
                .eq(ImFileUploadPart::getPartNumber, partNumber));
        if (existing == null) {
            existing = new ImFileUploadPart();
            existing.setUploadId(uploadId);
            existing.setPartNumber(partNumber);
            existing.setCreateTime(LocalDateTime.now());
        }
        existing.setPartSize(file.getSize());
        existing.setObjectKey(chunkKey);
        existing.setEtag(UUID.randomUUID().toString());
        existing.setStatus(PART_STATUS_UPLOADED);
        existing.setUpdateTime(LocalDateTime.now());
        if (existing.getId() == null) {
            uploadPartMapper.insert(existing);
        } else {
            uploadPartMapper.updateById(existing);
        }

        upload.setUpdateTime(LocalDateTime.now());
        uploadMapper.updateById(upload);
        return toUploadVO(upload);
    }

    @Override
    @Transactional
    public FileVO completeUpload(Long userId, String uploadId, FileUploadCompleteRequest request) {
        ImFileUpload upload = getOwnedUpload(userId, uploadId);
        if (!STATUS_UPLOADING.equals(upload.getStatus())) {
            if (upload.getFileId() != null) {
                return toFileVO(fileMapper.selectById(upload.getFileId()));
            }
            throw new BusinessException("Upload is not active");
        }

        List<ImFileUploadPart> parts = listParts(uploadId);
        if (parts.size() != upload.getTotalParts()) {
            throw new BusinessException(400, "Upload is missing chunks");
        }
        List<String> chunkKeys = parts.stream()
                .sorted(Comparator.comparing(ImFileUploadPart::getPartNumber))
                .map(ImFileUploadPart::getObjectKey)
                .collect(Collectors.toList());

        try {
            storageClient.compose(upload.getObjectKey(), chunkKeys, upload.getFileSize(), upload.getContentType());
        } catch (Exception e) {
            throw new BusinessException("Failed to complete upload: " + e.getMessage());
        }

        ImFile imFile = new ImFile();
        imFile.setOriginalName(upload.getFileName());
        imFile.setStoredName(upload.getObjectKey().substring(upload.getObjectKey().lastIndexOf('/') + 1));
        imFile.setFilePath(upload.getObjectKey());
        imFile.setFileSize(upload.getFileSize());
        imFile.setContentType(upload.getContentType());
        imFile.setUploaderId(userId);
        imFile.setConversationId(upload.getConversationId());
        imFile.setSha256(StringUtils.hasText(request.getSha256()) ? normalizeSha256(request.getSha256()) : upload.getSha256());
        imFile.setStorageType(storageClient.storageType());
        imFile.setBucket(storageClient.bucket());
        imFile.setObjectKey(upload.getObjectKey());
        imFile.setStatus(STATUS_AVAILABLE);
        imFile.setDownloadCount(0);
        imFile.setCreateTime(LocalDateTime.now());
        imFile.setTemporary(0);
        imFile.setExpiresAt(null);
        fileMapper.insert(imFile);

        upload.setStatus(STATUS_COMPLETED);
        upload.setFileId(imFile.getId());
        upload.setUpdateTime(LocalDateTime.now());
        uploadMapper.updateById(upload);
        if (StringUtils.hasText(upload.getTransferId())) {
            ImFileTransfer transfer = transferMapper.selectOne(new LambdaQueryWrapper<ImFileTransfer>()
                    .eq(ImFileTransfer::getTransferId, upload.getTransferId()));
            if (transfer != null) {
                transfer.setStatus(STATUS_COMPLETED);
                transfer.setFileId(imFile.getId());
                transfer.setUpdateTime(LocalDateTime.now());
                transferMapper.updateById(transfer);
            }
        }

        for (String chunkKey : chunkKeys) {
            storageClient.deleteQuietly(chunkKey);
        }
        return toFileVO(imFile);
    }

    @Override
    public PageResult<FileVO> listConversationFiles(Long userId, Long conversationId, String type, String keyword, int page, int pageSize) {
        assertConversationMember(userId, conversationId);
        int safePage = Math.max(1, page);
        int safePageSize = Math.max(1, Math.min(pageSize, 100));
        String normalizedType = StringUtils.hasText(type) ? type.trim().toLowerCase() : "all";

        LambdaQueryWrapper<ImFile> countWrapper = buildConversationFileQuery(conversationId, normalizedType, keyword);
        Long total = fileMapper.selectCount(countWrapper);

        LambdaQueryWrapper<ImFile> pageWrapper = buildConversationFileQuery(conversationId, normalizedType, keyword);
        pageWrapper.orderByDesc(ImFile::getCreateTime)
                .last("LIMIT " + ((safePage - 1) * safePageSize) + ", " + safePageSize);

        List<FileVO> records = fileMapper.selectList(pageWrapper).stream()
                .map(this::toFileVO)
                .collect(Collectors.toList());
        return PageResult.success(records, total != null ? total : 0, safePage, safePageSize);
    }

    @Override
    @Transactional
    public void abortUpload(Long userId, String uploadId) {
        ImFileUpload upload = getOwnedUpload(userId, uploadId);
        upload.setStatus(STATUS_ABORTED);
        upload.setUpdateTime(LocalDateTime.now());
        uploadMapper.updateById(upload);
        for (ImFileUploadPart part : listParts(uploadId)) {
            storageClient.deleteQuietly(part.getObjectKey());
            uploadPartMapper.deleteById(part.getId());
        }
    }

    @Override
    public ImFile getDownloadableFile(Long userId, Long fileId) {
        ImFile imFile = fileMapper.selectById(fileId);
        if (imFile == null) {
            throw new BusinessException(404, "File not found");
        }
        if (!STATUS_AVAILABLE.equals(imFile.getStatus())) {
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

    @Override
    public StoredObject openFile(ImFile file, long offset, Long length) {
        try {
            return storageClient.open(file.getObjectKey(), offset, length);
        } catch (Exception e) {
            throw new BusinessException("Failed to open file: " + e.getMessage());
        }
    }

    @Override
    public void incrementDownloadCount(Long fileId) {
        ImFile imFile = fileMapper.selectById(fileId);
        if (imFile == null) {
            return;
        }
        imFile.setDownloadCount((imFile.getDownloadCount() == null ? 0 : imFile.getDownloadCount()) + 1);
        fileMapper.updateById(imFile);
    }

    @Override
    public void validateFileMessage(Long senderId, Long conversationId, String content) {
        try {
            JsonNode root = objectMapper.readTree(content);
            JsonNode fileIdNode = root.get("fileId");
            if (fileIdNode == null || !fileIdNode.canConvertToLong()) {
                throw new BusinessException(400, "FILE message must include fileId");
            }
            ImFile imFile = fileMapper.selectById(fileIdNode.asLong());
            if (imFile == null || !STATUS_AVAILABLE.equals(imFile.getStatus())) {
                throw new BusinessException(400, "File is not available");
            }
            if (!senderId.equals(imFile.getUploaderId())) {
                throw new BusinessException(403, "Only the uploader can send this file");
            }
            if (imFile.getConversationId() != null && !conversationId.equals(imFile.getConversationId())) {
                throw new BusinessException(403, "File does not belong to this conversation");
            }
            if (imFile.getExpiresAt() != null && imFile.getExpiresAt().isBefore(LocalDateTime.now())) {
                throw new BusinessException(410, "File has expired");
            }
            imFile.setConversationId(conversationId);
            imFile.setTemporary(0);
            imFile.setExpiresAt(null);
            fileMapper.updateById(imFile);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(400, "Invalid FILE message content");
        }
    }

    @Override
    @Transactional
    public void cleanupExpiredTemporaryFiles() {
        List<ImFile> expiredFiles = fileMapper.selectList(new LambdaQueryWrapper<ImFile>()
                .eq(ImFile::getTemporary, 1)
                .eq(ImFile::getStatus, STATUS_AVAILABLE)
                .lt(ImFile::getExpiresAt, LocalDateTime.now()));
        for (ImFile imFile : expiredFiles) {
            storageClient.deleteQuietly(imFile.getObjectKey());
            imFile.setStatus(STATUS_EXPIRED);
            fileMapper.updateById(imFile);
        }
    }

    @Override
    @Transactional
    public void cleanupExpiredUploads() {
        List<ImFileUpload> expiredUploads = uploadMapper.selectList(new LambdaQueryWrapper<ImFileUpload>()
                .eq(ImFileUpload::getStatus, STATUS_UPLOADING)
                .lt(ImFileUpload::getExpiresAt, LocalDateTime.now()));
        for (ImFileUpload upload : expiredUploads) {
            for (ImFileUploadPart part : listParts(upload.getUploadId())) {
                storageClient.deleteQuietly(part.getObjectKey());
                uploadPartMapper.deleteById(part.getId());
            }
            upload.setStatus(STATUS_ABORTED);
            upload.setUpdateTime(LocalDateTime.now());
            uploadMapper.updateById(upload);
        }
    }

    private void validateTransferRequest(Long userId, Long conversationId, String fileName, Long fileSize) {
        if (conversationId == null) {
            throw new BusinessException(400, "conversationId is required");
        }
        assertConversationMember(userId, conversationId);
        if (!StringUtils.hasText(fileName)) {
            throw new BusinessException(400, "fileName is required");
        }
        validateUploadSize(fileSize == null ? 0 : fileSize, properties.getMaxSize(), "File exceeds 50GB limit");
    }

    private void validateUploadSize(long size, long maxSize, String message) {
        if (size <= 0) {
            throw new BusinessException(400, "File is empty");
        }
        if (size > maxSize) {
            throw new BusinessException(413, message);
        }
    }

    private void assertConversationMember(Long userId, Long conversationId) {
        ImConversationMember member = conversationMemberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId));
        if (member == null) {
            throw new BusinessException(403, "Not a member of this conversation");
        }
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

    private ImFileUpload getOwnedUpload(Long userId, String uploadId) {
        ImFileUpload upload = uploadMapper.selectOne(new LambdaQueryWrapper<ImFileUpload>()
                .eq(ImFileUpload::getUploadId, uploadId)
                .eq(ImFileUpload::getUploaderId, userId));
        if (upload == null) {
            throw new BusinessException(404, "Upload not found");
        }
        return upload;
    }

    private List<ImFileUploadPart> listParts(String uploadId) {
        return uploadPartMapper.selectList(new LambdaQueryWrapper<ImFileUploadPart>()
                .eq(ImFileUploadPart::getUploadId, uploadId)
                .eq(ImFileUploadPart::getStatus, PART_STATUS_UPLOADED)
                .orderByAsc(ImFileUploadPart::getPartNumber));
    }

    private ImFile findReusableFile(String sha256, Long fileSize, Long uploaderId, Long conversationId) {
        if (!StringUtils.hasText(sha256)) {
            return null;
        }
        LambdaQueryWrapper<ImFile> wrapper = new LambdaQueryWrapper<ImFile>()
                .eq(ImFile::getSha256, sha256)
                .eq(ImFile::getUploaderId, uploaderId)
                .eq(fileSize != null, ImFile::getFileSize, fileSize)
                .eq(ImFile::getStatus, STATUS_AVAILABLE)
                .and(w -> w.isNull(ImFile::getExpiresAt).or().gt(ImFile::getExpiresAt, LocalDateTime.now()))
                .and(w -> w.isNull(ImFile::getConversationId).or().eq(ImFile::getConversationId, conversationId))
                .last("LIMIT 1");
        return fileMapper.selectOne(wrapper);
    }

    private FileTransferVO toTransferVO(ImFileTransfer transfer) {
        FileTransferVO vo = new FileTransferVO();
        vo.setTransferId(transfer.getTransferId());
        vo.setMode(transfer.getMode());
        vo.setStatus(transfer.getStatus());
        vo.setFileId(transfer.getFileId());
        vo.setFileName(transfer.getFileName());
        vo.setFileSize(transfer.getFileSize());
        vo.setContentType(transfer.getContentType());
        vo.setSha256(transfer.getSha256());
        vo.setExpiresAt(transfer.getExpiresAt());
        return vo;
    }

    private FileUploadVO toUploadVO(ImFileUpload upload) {
        FileUploadVO vo = new FileUploadVO();
        vo.setUploadId(upload.getUploadId());
        vo.setTransferId(upload.getTransferId());
        vo.setChunkSize(upload.getChunkSize());
        vo.setTotalParts(upload.getTotalParts());
        vo.setUploadedParts(listParts(upload.getUploadId()).stream()
                .map(ImFileUploadPart::getPartNumber)
                .collect(Collectors.toList()));
        vo.setStatus(upload.getStatus());
        vo.setInstant(false);
        if (upload.getFileId() != null) {
            vo.setFile(toFileVO(fileMapper.selectById(upload.getFileId())));
        }
        return vo;
    }

    private FileVO toFileVO(ImFile file) {
        if (file == null) {
            return null;
        }
        FileVO vo = new FileVO();
        vo.setId(file.getId());
        vo.setOriginalName(file.getOriginalName());
        vo.setSize(file.getFileSize());
        vo.setDisplaySize(displaySize(file.getFileSize()));
        vo.setContentType(file.getContentType());
        vo.setSha256(file.getSha256());
        vo.setStatus(file.getStatus());
        vo.setUrl("/api/files/download/" + file.getId());
        vo.setConversationId(file.getConversationId());
        vo.setUploaderId(file.getUploaderId());
        SysUser uploader = userMapper.selectById(file.getUploaderId());
        vo.setUploaderName(uploader != null ? uploader.getNickname() : null);
        vo.setCreatedAt(file.getCreateTime());
        vo.setDownloadCount(file.getDownloadCount());
        vo.setExpiresAt(file.getExpiresAt());
        return vo;
    }

    private LambdaQueryWrapper<ImFile> buildConversationFileQuery(Long conversationId, String type, String keyword) {
        LambdaQueryWrapper<ImFile> wrapper = new LambdaQueryWrapper<ImFile>()
                .eq(ImFile::getConversationId, conversationId)
                .eq(ImFile::getStatus, STATUS_AVAILABLE)
                .and(w -> w.isNull(ImFile::getExpiresAt).or().gt(ImFile::getExpiresAt, LocalDateTime.now()));
        if ("image".equals(type)) {
            wrapper.likeRight(ImFile::getContentType, "image/");
        } else if ("file".equals(type)) {
            wrapper.and(w -> w.isNull(ImFile::getContentType).or().notLikeRight(ImFile::getContentType, "image/"));
        }
        if (StringUtils.hasText(keyword)) {
            wrapper.like(ImFile::getOriginalName, keyword.trim());
        }
        return wrapper;
    }

    private String displaySize(Long size) {
        if (size == null) {
            return "";
        }
        double value = size;
        String[] units = {"B", "KB", "MB", "GB", "TB"};
        int unit = 0;
        while (value >= 1024 && unit < units.length - 1) {
            value /= 1024;
            unit++;
        }
        return unit == 0 ? (long) value + units[unit] : String.format("%.1f%s", value, units[unit]);
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

    private String normalizeSha256(String sha256) {
        if (!StringUtils.hasText(sha256)) {
            return null;
        }
        return sha256.trim().toLowerCase();
    }
}
