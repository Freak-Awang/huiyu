package com.im.server.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.im.common.dto.FileVO;
import com.im.common.entity.ImConversationMember;
import com.im.common.entity.ImFile;
import com.im.common.entity.SysUser;
import com.im.common.exception.BusinessException;
import com.im.server.mapper.ConversationMemberMapper;
import com.im.server.mapper.FileMapper;
import com.im.server.mapper.UserMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * Intent: FileMetadataService owns file metadata persistence, lookup, reuse, and file drawer queries.
 */
@Service
public class FileMetadataService {

    public static final String STATUS_AVAILABLE = "AVAILABLE";
    public static final String STATUS_EXPIRED = "EXPIRED";

    private final FileMapper fileMapper;
    private final ConversationMemberMapper conversationMemberMapper;
    private final UserMapper userMapper;

    public FileMetadataService(
            FileMapper fileMapper,
            ConversationMemberMapper conversationMemberMapper,
            UserMapper userMapper) {
        this.fileMapper = fileMapper;
        this.conversationMemberMapper = conversationMemberMapper;
        this.userMapper = userMapper;
    }

    public ImFile getById(Long id) {
        return fileMapper.selectById(id);
    }

    public ImFile createAvailableFile(
            String originalName,
            String objectKey,
            Long fileSize,
            String contentType,
            Long uploaderId,
            Long conversationId,
            String sha256,
            String storageType,
            String bucket,
            boolean temporary,
            LocalDateTime expiresAt) {
        ImFile imFile = new ImFile();
        imFile.setOriginalName(originalName);
        imFile.setStoredName(objectKey.substring(objectKey.lastIndexOf('/') + 1));
        imFile.setFilePath(objectKey);
        imFile.setFileSize(fileSize);
        imFile.setContentType(contentType);
        imFile.setUploaderId(uploaderId);
        imFile.setConversationId(conversationId);
        imFile.setSha256(sha256);
        imFile.setStorageType(storageType);
        imFile.setBucket(bucket);
        imFile.setObjectKey(objectKey);
        imFile.setStatus(STATUS_AVAILABLE);
        imFile.setDownloadCount(0);
        imFile.setCreateTime(LocalDateTime.now());
        imFile.setTemporary(temporary ? 1 : 0);
        imFile.setExpiresAt(expiresAt);
        fileMapper.insert(imFile);
        return imFile;
    }

    public void markExpired(ImFile imFile) {
        imFile.setStatus(STATUS_EXPIRED);
        fileMapper.updateById(imFile);
    }

    public void incrementDownloadCount(Long fileId) {
        ImFile imFile = fileMapper.selectById(fileId);
        if (imFile == null) {
            return;
        }
        imFile.setDownloadCount((imFile.getDownloadCount() == null ? 0 : imFile.getDownloadCount()) + 1);
        fileMapper.updateById(imFile);
    }

    public void assertConversationMember(Long userId, Long conversationId) {
        ImConversationMember member = conversationMemberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId));
        if (member == null) {
            throw new BusinessException(403, "Not a member of this conversation");
        }
    }

    public FileVO toFileVO(ImFile file) {
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
        vo.setDownloadUrl(vo.getUrl());
        vo.setTransferMode("object_storage");
        vo.setConversationId(file.getConversationId());
        vo.setUploaderId(file.getUploaderId());
        SysUser uploader = userMapper.selectById(file.getUploaderId());
        vo.setUploaderName(uploader != null ? uploader.getNickname() : null);
        vo.setCreatedAt(file.getCreateTime());
        vo.setDownloadCount(file.getDownloadCount());
        vo.setExpiresAt(file.getExpiresAt());
        return vo;
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
}
