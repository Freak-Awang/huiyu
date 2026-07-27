package com.im.server.service;

import com.im.common.exception.BusinessException;
import com.im.server.config.FileStorageProperties;
import com.im.server.mapper.FileMapper;
import com.im.server.mapper.FileUploadMapper;
import com.im.server.mapper.UserMapper;
import org.springframework.stereotype.Service;

@Service
public class FileQuotaService {

    private final FileMapper fileMapper;
    private final FileUploadMapper uploadMapper;
    private final UserMapper userMapper;
    private final FileStorageProperties properties;

    public FileQuotaService(
            FileMapper fileMapper,
            FileUploadMapper uploadMapper,
            UserMapper userMapper,
            FileStorageProperties properties) {
        this.fileMapper = fileMapper;
        this.uploadMapper = uploadMapper;
        this.userMapper = userMapper;
        this.properties = properties;
    }

    public void assertCanStore(Long userId, long incomingBytes) {
        if (userMapper.lockById(userId) == null) {
            throw new BusinessException(401, "User is not available");
        }
        long available = value(fileMapper.sumAvailableBytesByUploader(userId));
        long uploading = value(uploadMapper.sumActiveBytesByUploader(userId));
        long quota = properties.getUserQuotaBytes();
        if (quota <= 0 || incomingBytes <= 0 || incomingBytes > quota
                || available > quota - incomingBytes
                || uploading > Math.max(0L, quota - incomingBytes - available)) {
            throw new BusinessException(413, "User storage quota exceeded");
        }
    }

    private long value(Long value) {
        return value != null ? value : 0L;
    }
}
