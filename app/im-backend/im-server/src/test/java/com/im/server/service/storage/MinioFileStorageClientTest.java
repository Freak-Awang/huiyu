package com.im.server.service.storage;

import com.im.server.config.FileStorageProperties;
import io.minio.BucketExistsArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * MinIO 文件存储客户端测试，验证 bucket 不存在时的安全拒绝行为。
 *
 * <p>测试范围：MinioFileStorageClient.save 在 bucket 不存在时拒绝写入。</p>
 */
class MinioFileStorageClientTest {

    /**
     * 验证 MinIO bucket 不存在时 save 方法抛出 IllegalStateException，
     * 且不会调用 putObject（防止数据写入不存在的 bucket）。
     */
    @Test
    void refusesToCreateMissingBucketWithApplicationCredentials() throws Exception {
        MinioClient minioClient = mock(MinioClient.class);
        when(minioClient.bucketExists(any(BucketExistsArgs.class))).thenReturn(false); // bucket 不存在
        FileStorageProperties properties = new FileStorageProperties();
        properties.getMinio().setBucket("im-files");
        MinioFileStorageClient client = new MinioFileStorageClient(minioClient, properties);
        MockMultipartFile file =
                new MockMultipartFile("file", "test.txt", "text/plain", "hello".getBytes());

        assertThatThrownBy(() -> client.save("files/test.txt", file))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("MinIO bucket does not exist: im-files");
        verify(minioClient, never()).putObject(any(PutObjectArgs.class)); // 不写入
    }
}
