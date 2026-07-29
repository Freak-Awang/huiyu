package com.im.server.service.storage;

import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
/**
 * 文件存储客户端接口：屏蔽底层存储（本地磁盘/MinIO）差异，提供统一的对象存储操作契约。
 */
public interface FileStorageClient {

    /**
     * 获取存储类型标识。
     *
     * @return 存储类型（local、minio 等）
     */
    String storageType();

    /**
     * 获取存储桶/根路径标识。
     *
     * @return 存储桶名称
     */
    String bucket();

    /**
     * 保存完整文件对象。
     *
     * @param objectKey 对象 Key
     * @param file 上传文件
     * @throws Exception 存储失败时抛出
     */
    void save(String objectKey, MultipartFile file) throws Exception;

    /**
     * 保存分片对象。
     *
     * @param objectKey 分片对象 Key
     * @param file 分片文件
     * @throws Exception 存储失败时抛出
     */
    void saveChunk(String objectKey, MultipartFile file) throws Exception;

    /**
     * 将多个分片合并为完整对象。
     *
     * @param objectKey 目标对象 Key
     * @param chunkKeys 分片 Key 列表（按顺序）
     * @param size 文件总大小
     * @param contentType 内容类型
     * @throws Exception 合并失败时抛出
     */
    void compose(String objectKey, List<String> chunkKeys, long size, String contentType) throws Exception;

    /**
     * 打开对象流，支持 Range 读取。
     *
     * @param objectKey 对象 Key
     * @param offset 起始偏移量
     * @param length 读取长度，null 表示读到末尾
     * @return 存储对象
     * @throws Exception 读取失败时抛出
     */
    StoredObject open(String objectKey, long offset, Long length) throws Exception;

    /**
     * 删除对象。
     *
     * @param objectKey 对象 Key
     * @throws Exception 删除失败时抛出
     */
    void delete(String objectKey) throws Exception;

    /**
     * 静默删除对象，忽略异常（用于清理场景）。
     *
     * @param objectKey 对象 Key
     */
    default void deleteQuietly(String objectKey) {
        try {
            delete(objectKey);
        } catch (Exception ignored) {
        }
    }
}
