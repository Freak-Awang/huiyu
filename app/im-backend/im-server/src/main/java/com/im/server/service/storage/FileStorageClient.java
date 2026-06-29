package com.im.server.service.storage;

import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
/**
 * Intent: FileStorageClient hides storage-provider details behind a stable file storage contract.
 */

public interface FileStorageClient {
    String storageType();

    String bucket();

    void save(String objectKey, MultipartFile file) throws Exception;

    void saveChunk(String objectKey, MultipartFile file) throws Exception;

    void compose(String objectKey, List<String> chunkKeys, long size, String contentType) throws Exception;

    StoredObject open(String objectKey, long offset, Long length) throws Exception;

    void delete(String objectKey) throws Exception;

    default void deleteQuietly(String objectKey) {
        try {
            delete(objectKey);
        } catch (Exception ignored) {
        }
    }
}
