package com.im.server.service.storage;

import com.im.server.config.FileStorageProperties;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 文件存储路由测试，验证默认客户端选择和按 storageType/bucket 路由。
 *
 * <p>测试范围：FileStorageRouter 的 defaultClient 和 clientFor 路由逻辑。</p>
 */
class FileStorageRouterTest {

    /**
     * 验证默认写客户端为配置的 storage（minio），按 storageType+bucket 路由到对应客户端，
     * null/null 回退到 local（兼容旧数据）。
     */
    @Test
    void defaultsWritesToConfiguredStorageAndRoutesLegacyReads() {
        FileStorageProperties properties = new FileStorageProperties();
        properties.setStorage("minio");
        FileStorageClient local = client("local", "local");
        FileStorageClient minio = client("minio", "im-files");

        FileStorageRouter router = new FileStorageRouter(properties, List.of(local, minio));

        assertThat(router.defaultClient()).isSameAs(minio); // 默认写入 minio
        assertThat(router.clientFor("local", "local")).isSameAs(local); // 精确匹配
        assertThat(router.clientFor(null, null)).isSameAs(local); // null 回退到 local
    }

    /**
     * 验证未知 storageType 抛出 IllegalArgumentException，bucket 不匹配也抛出异常。
     */
    @Test
    void rejectsUnknownStorageTypeAndBucketMismatch() {
        FileStorageProperties properties = new FileStorageProperties();
        properties.setStorage("local");
        FileStorageRouter router =
                new FileStorageRouter(properties, List.of(client("local", "local")));

        assertThatThrownBy(() -> router.clientFor("missing"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Unsupported file storage type: missing");
        assertThatThrownBy(() -> router.clientFor("local", "im-files")) // storageType 匹配但 bucket 不匹配
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Storage bucket mismatch");
    }

    private FileStorageClient client(String storageType, String bucket) {
        FileStorageClient client = mock(FileStorageClient.class);
        when(client.storageType()).thenReturn(storageType);
        when(client.bucket()).thenReturn(bucket);
        return client;
    }
}
