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

class MinioFileStorageClientTest {

    @Test
    void refusesToCreateMissingBucketWithApplicationCredentials() throws Exception {
        MinioClient minioClient = mock(MinioClient.class);
        when(minioClient.bucketExists(any(BucketExistsArgs.class))).thenReturn(false);
        FileStorageProperties properties = new FileStorageProperties();
        properties.getMinio().setBucket("im-files");
        MinioFileStorageClient client = new MinioFileStorageClient(minioClient, properties);
        MockMultipartFile file =
                new MockMultipartFile("file", "test.txt", "text/plain", "hello".getBytes());

        assertThatThrownBy(() -> client.save("files/test.txt", file))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("MinIO bucket does not exist: im-files");
        verify(minioClient, never()).putObject(any(PutObjectArgs.class));
    }
}
