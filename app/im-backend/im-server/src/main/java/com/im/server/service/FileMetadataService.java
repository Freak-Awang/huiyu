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
 * 媒体元数据服务：负责聊天图片和头像元数据的持久化与查询。
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

    /**
     * 按 ID 查询文件元数据。
     *
     * @param id 文件 ID
     * @return 文件实体，不存在时返回 null
     */
    public ImFile getById(Long id) {
        return fileMapper.selectById(id);
    }

    /**
     * 创建可用状态的文件元数据记录。
     *
     * @param originalName 原始文件名
     * @param objectKey 对象存储 Key
     * @param fileSize 文件大小
     * @param contentType 内容类型
     * @param uploaderId 上传者 ID
     * @param conversationId 所属会话 ID，可为空
     * @param sha256 文件 SHA-256 哈希
     * @param storageType 存储类型
     * @param bucket 存储桶
     * @return 创建后的文件实体
     */
    public ImFile createAvailableFile(
            String originalName,
            String objectKey,
            Long fileSize,
            String contentType,
            Long uploaderId,
            Long conversationId,
            String sha256,
            String storageType,
            String bucket) {
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
        imFile.setTemporary(0);
        imFile.setExpiresAt(null);
        fileMapper.insert(imFile);
        return imFile;
    }

    /**
     * 将文件标记为已过期。
     *
     * @param imFile 文件实体
     */
    public void markExpired(ImFile imFile) {
        imFile.setStatus(STATUS_EXPIRED);
        fileMapper.updateById(imFile);
    }

    /**
     * 增加文件下载计数。
     *
     * @param fileId 文件 ID
     */
    public void incrementDownloadCount(Long fileId) {
        ImFile imFile = fileMapper.selectById(fileId);
        if (imFile == null) {
            return;
        }
        imFile.setDownloadCount((imFile.getDownloadCount() == null ? 0 : imFile.getDownloadCount()) + 1);
        fileMapper.updateById(imFile);
    }

    /**
     * 断言用户是会话成员，否则抛出 403 异常。
     *
     * @param userId 用户 ID
     * @param conversationId 会话 ID
     * @throws BusinessException 用户不是会话成员时抛出
     */
    public void assertConversationMember(Long userId, Long conversationId) {
        ImConversationMember member = conversationMemberMapper.selectOne(new LambdaQueryWrapper<ImConversationMember>()
                .eq(ImConversationMember::getConversationId, conversationId)
                .eq(ImConversationMember::getUserId, userId));
        if (member == null) {
            throw new BusinessException(403, "Not a member of this conversation");
        }
    }

    /**
     * 将文件实体转换为视图对象，补充展示字段。
     *
     * @param file 文件实体
     * @return 文件视图对象，file 为 null 时返回 null
     */
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
