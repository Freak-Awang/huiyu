package com.im.server.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 文件存储属性配置。
 * <p>
 * 绑定 {@code file.*} 前缀的配置项，涵盖存储策略（local/minio）、
 * 媒体大小限制、用户配额、保留策略、上传路径及 MinIO 连接参数。
 * </p>
 */
@Component
@ConfigurationProperties(prefix = "file")
public class FileStorageProperties {
    private String storage = "local";
    private Long smallFileMaxSize = 104857600L;
    private Long userQuotaBytes = 10737418240L;
    private String uploadPath = "./upload";
    private Minio minio = new Minio();

    public String getStorage() {
        return storage;
    }

    public void setStorage(String storage) {
        this.storage = storage;
    }

    public Long getSmallFileMaxSize() {
        return smallFileMaxSize;
    }

    public void setSmallFileMaxSize(Long smallFileMaxSize) {
        this.smallFileMaxSize = smallFileMaxSize;
    }

    public Long getUserQuotaBytes() {
        return userQuotaBytes;
    }

    public void setUserQuotaBytes(Long userQuotaBytes) {
        this.userQuotaBytes = userQuotaBytes;
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
        private String accessKey = "";
        private String secretKey = "";

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
