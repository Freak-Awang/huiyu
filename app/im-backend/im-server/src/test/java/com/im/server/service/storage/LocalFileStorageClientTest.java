package com.im.server.service.storage;

import com.im.server.config.FileStorageProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class LocalFileStorageClientTest {

    @TempDir
    Path tempDir;

    @Test
    void rangeStreamStopsAtRequestedLength() throws Exception {
        LocalFileStorageClient client = client();
        client.save("files/sample.bin", new MockMultipartFile(
                "file", "sample.bin", "application/octet-stream", "0123456789".getBytes()));

        StoredObject object = client.open("files/sample.bin", 2, 4L);

        assertThat(object.getInputStream().readAllBytes()).isEqualTo("2345".getBytes());
        assertThat(object.getSize()).isEqualTo(4L);
    }

    @Test
    void composeJoinsChunksInProvidedOrder() throws Exception {
        LocalFileStorageClient client = client();
        client.saveChunk("chunks/1", new MockMultipartFile("file", "1", null, "hello ".getBytes()));
        client.saveChunk("chunks/2", new MockMultipartFile("file", "2", null, "world".getBytes()));

        client.compose("files/result.bin", List.of("chunks/1", "chunks/2"), 11, "application/octet-stream");

        assertThat(client.open("files/result.bin", 0, null).getInputStream().readAllBytes())
                .isEqualTo("hello world".getBytes());
    }

    private LocalFileStorageClient client() {
        FileStorageProperties properties = new FileStorageProperties();
        properties.setUploadPath(tempDir.toString());
        return new LocalFileStorageClient(properties);
    }
}
