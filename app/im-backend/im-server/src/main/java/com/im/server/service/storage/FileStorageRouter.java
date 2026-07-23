package com.im.server.service.storage;

import com.im.server.config.FileStorageProperties;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Routes storage operations to the backend recorded with each file or upload task.
 */
public class FileStorageRouter {
    private final Map<String, FileStorageClient> clients;
    private final String defaultStorageType;

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

    public FileStorageClient defaultClient() {
        return requireClient(defaultStorageType);
    }

    public FileStorageClient clientFor(String storageType) {
        return requireClient(normalize(storageType));
    }

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
