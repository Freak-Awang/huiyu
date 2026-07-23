package com.im.server.config;

import com.im.server.service.storage.FileStorageClient;
import com.im.server.service.storage.FileStorageRouter;
import com.im.server.service.storage.LocalFileStorageClient;
import com.im.server.service.storage.MinioFileStorageClient;
import io.minio.MinioClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

/**
 * Intent: FileStorageConfig centralizes framework configuration so infrastructure behavior stays explicit.
 */
@Configuration
public class FileStorageConfig {

    @Bean
    public LocalFileStorageClient localFileStorageClient(FileStorageProperties properties) {
        return new LocalFileStorageClient(properties);
    }

    @Bean
    public MinioClient minioClient(FileStorageProperties properties) {
        return MinioClient.builder()
                .endpoint(properties.getMinio().getEndpoint())
                .credentials(properties.getMinio().getAccessKey(), properties.getMinio().getSecretKey())
                .build();
    }

    @Bean
    public MinioFileStorageClient minioFileStorageClient(
            MinioClient minioClient,
            FileStorageProperties properties) {
        return new MinioFileStorageClient(minioClient, properties);
    }

    @Bean
    public FileStorageRouter fileStorageRouter(
            FileStorageProperties properties,
            List<FileStorageClient> storageClients) {
        return new FileStorageRouter(properties, storageClients);
    }
}
