package com.im.server.service.storage;

import com.im.server.config.FileStorageProperties;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 文件存储路由器：根据文件或上传任务记录的存储类型，将操作路由到对应的存储后端。
 */
public class FileStorageRouter {
    private final Map<String, FileStorageClient> clients;
    private final String defaultStorageType;

    /**
     * 构造存储路由器。
     *
     * @param properties 存储配置
     * @param clients 所有可用的存储客户端
     * @throws IllegalArgumentException 存在重复存储类型或默认存储类型未注册时抛出
     */
    public FileStorageRouter(FileStorageProperties properties, List<FileStorageClient> clients) {
        this.defaultStorageType = normalize(properties.getStorage());
        this.clients = new LinkedHashMap<>();
        for (FileStorageClient client : clients) {
            String storageType = normalize(client.storageType());
            if (this.clients.put(storageType, client) != null) {
                throw new IllegalArgumentException("Duplicate file storage client: " + storageType);
            }
        }
        requireClient(defaultStorageType);
    }

    /**
     * 获取默认存储客户端。
     *
     * @return 默认存储客户端
     */
    public FileStorageClient defaultClient() {
        return requireClient(defaultStorageType);
    }

    /**
     * 按存储类型获取客户端。
     *
     * @param storageType 存储类型
     * @return 存储客户端
     */
    public FileStorageClient clientFor(String storageType) {
        return requireClient(normalize(storageType));
    }

    /**
     * 按存储类型和存储桶获取客户端，并校验桶匹配。
     *
     * @param storageType 存储类型
     * @param bucket 存储桶
     * @return 存储客户端
     * @throws IllegalArgumentException 存储桶不匹配时抛出
     */
    public FileStorageClient clientFor(String storageType, String bucket) {
        FileStorageClient client = clientFor(storageType);
        if (StringUtils.hasText(bucket) && !bucket.equals(client.bucket())) {
            throw new IllegalArgumentException(
                    "Storage bucket mismatch for " + client.storageType() + ": " + bucket);
        }
        return client;
    }

    private FileStorageClient requireClient(String storageType) {
        FileStorageClient client = clients.get(storageType);
        if (client == null) {
            throw new IllegalArgumentException("Unsupported file storage type: " + storageType);
        }
        return client;
    }

    private String normalize(String storageType) {
        return StringUtils.hasText(storageType)
                ? storageType.trim().toLowerCase(Locale.ROOT)
                : "local";
    }
}
