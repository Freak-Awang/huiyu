package com.im.server.config;

import com.im.server.service.storage.FileStorageClient;
import com.im.server.service.storage.LocalFileStorageClient;
import com.im.server.service.storage.MinioFileStorageClient;
import io.minio.MinioClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class FileStorageConfig {

    @Bean
    public FileStorageClient fileStorageClient(FileStorageProperties properties) {
        if ("minio".equalsIgnoreCase(properties.getStorage())) {
            MinioClient minioClient = MinioClient.builder()
                    .endpoint(properties.getMinio().getEndpoint())
                    .credentials(properties.getMinio().getAccessKey(), properties.getMinio().getSecretKey())
                    .build();
            return new MinioFileStorageClient(minioClient, properties);
        }
        return new LocalFileStorageClient(properties);
    }
}
