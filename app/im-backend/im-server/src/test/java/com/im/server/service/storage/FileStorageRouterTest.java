package com.im.server.service.storage;

import com.im.server.config.FileStorageProperties;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class FileStorageRouterTest {

    @Test
    void defaultsWritesToConfiguredStorageAndRoutesLegacyReads() {
        FileStorageProperties properties = new FileStorageProperties();
        properties.setStorage("minio");
        FileStorageClient local = client("local", "local");
        FileStorageClient minio = client("minio", "im-files");

        FileStorageRouter router = new FileStorageRouter(properties, List.of(local, minio));

        assertThat(router.defaultClient()).isSameAs(minio);
        assertThat(router.clientFor("local", "local")).isSameAs(local);
        assertThat(router.clientFor(null, null)).isSameAs(local);
    }

    @Test
    void rejectsUnknownStorageTypeAndBucketMismatch() {
        FileStorageProperties properties = new FileStorageProperties();
        properties.setStorage("local");
        FileStorageRouter router =
                new FileStorageRouter(properties, List.of(client("local", "local")));

        assertThatThrownBy(() -> router.clientFor("missing"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Unsupported file storage type: missing");
        assertThatThrownBy(() -> router.clientFor("local", "im-files"))
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
