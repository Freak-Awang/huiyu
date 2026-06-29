package com.im.server.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Intent: FileStorageProperties centralizes framework configuration so infrastructure behavior stays explicit.
 */
@Component
@ConfigurationProperties(prefix = "file")
public class FileStorageProperties {
    private String storage = "local";
    private Long maxSize = 53687091200L;
    private Long smallFileMaxSize = 104857600L;
    private Long chunkSize = 67108864L;
    private Integer retentionDays = 7;
    private Integer uploadRetentionHours = 24;
    private String uploadPath = "./upload";
    private Minio minio = new Minio();

    public String getStorage() {
        return storage;
    }

    public void setStorage(String storage) {
        this.storage = storage;
    }

    public Long getMaxSize() {
        return maxSize;
    }

    public void setMaxSize(Long maxSize) {
        this.maxSize = maxSize;
    }

    public Long getSmallFileMaxSize() {
        return smallFileMaxSize;
    }

    public void setSmallFileMaxSize(Long smallFileMaxSize) {
        this.smallFileMaxSize = smallFileMaxSize;
    }

    public Long getChunkSize() {
        return chunkSize;
    }

    public void setChunkSize(Long chunkSize) {
        this.chunkSize = chunkSize;
    }

    public Integer getRetentionDays() {
        return retentionDays;
    }

    public void setRetentionDays(Integer retentionDays) {
        this.retentionDays = retentionDays;
    }

    public Integer getUploadRetentionHours() {
        return uploadRetentionHours;
    }

    public void setUploadRetentionHours(Integer uploadRetentionHours) {
        this.uploadRetentionHours = uploadRetentionHours;
    }

    public String getUploadPath() {
        return uploadPath;
    }

    public void setUploadPath(String uploadPath) {
        this.uploadPath = uploadPath;
    }

    public Minio getMinio() {
        return minio;
    }

    public void setMinio(Minio minio) {
        this.minio = minio;
    }

    public static class Minio {
        private String endpoint = "http://localhost:9000";
        private String bucket = "im-files";
        private String accessKey = "imadmin";
        private String secretKey = "impassword";

        public String getEndpoint() {
            return endpoint;
        }

        public void setEndpoint(String endpoint) {
            this.endpoint = endpoint;
        }

        public String getBucket() {
            return bucket;
        }

        public void setBucket(String bucket) {
            this.bucket = bucket;
        }

        public String getAccessKey() {
            return accessKey;
        }

        public void setAccessKey(String accessKey) {
            this.accessKey = accessKey;
        }

        public String getSecretKey() {
            return secretKey;
        }

        public void setSecretKey(String secretKey) {
            this.secretKey = secretKey;
        }
    }
}
