package com.im.server.service.storage;

import com.im.server.config.FileStorageProperties;
import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.io.OutputStream;
import java.io.FilterInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.List;
/**
 * Intent: LocalFileStorageClient hides storage-provider details behind a stable file storage contract.
 */

public class LocalFileStorageClient implements FileStorageClient {
    private final Path root;

    public LocalFileStorageClient(FileStorageProperties properties) {
        this.root = Paths.get(properties.getUploadPath());
    }

    @Override
    public String storageType() {
        return "local";
    }

    @Override
    public String bucket() {
        return "local";
    }

    @Override
    public void save(String objectKey, MultipartFile file) throws Exception {
        Path target = resolve(objectKey);
        Files.createDirectories(target.getParent());
        file.transferTo(target.toFile());
    }

    @Override
    public void saveChunk(String objectKey, MultipartFile file) throws Exception {
        save(objectKey, file);
    }

    @Override
    public void compose(String objectKey, List<String> chunkKeys, long size, String contentType) throws Exception {
        Path target = resolve(objectKey);
        Files.createDirectories(target.getParent());
        try (OutputStream out = Files.newOutputStream(target, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING)) {
            for (String chunkKey : chunkKeys) {
                Files.copy(resolve(chunkKey), out);
            }
        }
    }

    @Override
    public StoredObject open(String objectKey, long offset, Long length) throws Exception {
        Path path = resolve(objectKey);
        InputStream in = Files.newInputStream(path);
        long skipped = in.skip(offset);
        while (skipped < offset) {
            long next = in.skip(offset - skipped);
            if (next <= 0) break;
            skipped += next;
        }
        long size = length != null ? length : Math.max(0, Files.size(path) - offset);
        String contentType = Files.probeContentType(path);
        if (contentType == null) {
            contentType = MediaType.APPLICATION_OCTET_STREAM_VALUE;
        }
        InputStream bounded = length == null ? in : new LimitedInputStream(in, length);
        return new StoredObject(bounded, size, contentType);
    }

    @Override
    public void delete(String objectKey) throws Exception {
        Files.deleteIfExists(resolve(objectKey));
    }

    private Path resolve(String objectKey) {
        Path resolved = root.resolve(objectKey).normalize();
        if (!resolved.startsWith(root.normalize())) {
            throw new IllegalArgumentException("Invalid object key");
        }
        return resolved;
    }

    private static final class LimitedInputStream extends FilterInputStream {
        private long remaining;

        private LimitedInputStream(InputStream input, long limit) {
            super(input);
            this.remaining = Math.max(0, limit);
        }

        @Override
        public int read() throws java.io.IOException {
            if (remaining <= 0) return -1;
            int value = super.read();
            if (value >= 0) remaining--;
            return value;
        }

        @Override
        public int read(byte[] bytes, int offset, int length) throws java.io.IOException {
            if (remaining <= 0) return -1;
            int read = super.read(bytes, offset, (int) Math.min(length, remaining));
            if (read > 0) remaining -= read;
            return read;
        }
    }
}
