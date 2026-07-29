package com.im.server.service;

import com.im.common.exception.BusinessException;
import com.im.server.config.FileStorageProperties;
import com.im.server.mapper.FileMapper;
import com.im.server.mapper.FileUploadMapper;
import com.im.server.mapper.UserMapper;
import org.springframework.stereotype.Service;

/**
 * 文件存储配额服务：校验用户剩余存储空间是否足够存放新文件。
 */
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

    /**
     * 断言用户有足够配额存放指定大小的文件。
     * <p>
     * 通过 SELECT ... FOR UPDATE 锁定用户行，防止并发上传导致配额超卖。
     * 已用空间 = 已可用文件总大小 + 进行中上传任务总大小。
     *
     * @param userId 用户 ID
     * @param incomingBytes 待存入文件字节数
     * @throws BusinessException 用户不可用或配额不足时抛出
     */
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
