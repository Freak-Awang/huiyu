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
 * 文件存储配置。
 * <p>
 * 集中配置文件存储相关的 Bean，包括本地存储客户端、MinIO 客户端、
 * MinIO 存储客户端以及存储路由器。支持本地磁盘和 MinIO 对象存储两种策略，
 * 通过 {@link FileStorageRouter} 根据配置动态路由。
 * </p>
 */
@Configuration
public class FileStorageConfig {

    /**
     * 注册本地文件存储客户端。
     */
    @Bean
    public LocalFileStorageClient localFileStorageClient(FileStorageProperties properties) {
        return new LocalFileStorageClient(properties);
    }

    /**
     * 注册 MinIO 客户端，连接对象存储服务。
     */
    @Bean
    public MinioClient minioClient(FileStorageProperties properties) {
        return MinioClient.builder()
                .endpoint(properties.getMinio().getEndpoint())
                .credentials(properties.getMinio().getAccessKey(), properties.getMinio().getSecretKey())
                .build();
    }

    /**
     * 注册 MinIO 文件存储客户端。
     */
    @Bean
    public MinioFileStorageClient minioFileStorageClient(
            MinioClient minioClient,
            FileStorageProperties properties) {
        return new MinioFileStorageClient(minioClient, properties);
    }

    /**
     * 注册文件存储路由器，根据配置将文件操作路由到本地或 MinIO 存储。
     */
    @Bean
    public FileStorageRouter fileStorageRouter(
            FileStorageProperties properties,
            List<FileStorageClient> storageClients) {
        return new FileStorageRouter(properties, storageClients);
    }
}
