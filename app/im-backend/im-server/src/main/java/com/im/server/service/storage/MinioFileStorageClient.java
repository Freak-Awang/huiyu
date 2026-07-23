package com.im.server.service.storage;

import com.im.server.config.FileStorageProperties;
import io.minio.BucketExistsArgs;
import io.minio.ComposeObjectArgs;
import io.minio.ComposeSource;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.stream.Collectors;
/**
 * Intent: MinioFileStorageClient hides storage-provider details behind a stable file storage contract.
 */

public class MinioFileStorageClient implements FileStorageClient {
    private final MinioClient minioClient;
    private final String bucket;
    private volatile boolean bucketVerified;

    public MinioFileStorageClient(MinioClient minioClient, FileStorageProperties properties) {
        this.minioClient = minioClient;
        this.bucket = properties.getMinio().getBucket();
    }

    @Override
    public String storageType() {
        return "minio";
    }

    @Override
    public String bucket() {
        return bucket;
    }

    @Override
    public void save(String objectKey, MultipartFile file) throws Exception {
        ensureBucket();
        minioClient.putObject(PutObjectArgs.builder()
                .bucket(bucket)
                .object(objectKey)
                .contentType(file.getContentType() != null ? file.getContentType() : MediaType.APPLICATION_OCTET_STREAM_VALUE)
                .stream(file.getInputStream(), file.getSize(), -1)
                .build());
    }

    @Override
    public void saveChunk(String objectKey, MultipartFile file) throws Exception {
        save(objectKey, file);
    }

    @Override
    public void compose(String objectKey, List<String> chunkKeys, long size, String contentType) throws Exception {
        ensureBucket();
        List<ComposeSource> sources = chunkKeys.stream()
                .map(key -> ComposeSource.builder().bucket(bucket).object(key).build())
                .collect(Collectors.toList());
        minioClient.composeObject(ComposeObjectArgs.builder()
                .bucket(bucket)
                .object(objectKey)
                .sources(sources)
                .build());
    }

    @Override
    public StoredObject open(String objectKey, long offset, Long length) throws Exception {
        ensureBucket();
        GetObjectArgs.Builder builder = GetObjectArgs.builder()
                .bucket(bucket)
                .object(objectKey)
                .offset(offset);
        if (length != null) {
            builder.length(length);
        }
        return new StoredObject(minioClient.getObject(builder.build()), length != null ? length : -1, MediaType.APPLICATION_OCTET_STREAM_VALUE);
    }

    @Override
    public void delete(String objectKey) throws Exception {
        ensureBucket();
        minioClient.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(objectKey).build());
    }

    private void ensureBucket() throws Exception {
        if (bucketVerified) {
            return;
        }
        synchronized (this) {
            if (bucketVerified) {
                return;
            }
            boolean exists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucket).build());
            if (!exists) {
                throw new IllegalStateException("MinIO bucket does not exist: " + bucket);
            }
            bucketVerified = true;
        }
    }
}
