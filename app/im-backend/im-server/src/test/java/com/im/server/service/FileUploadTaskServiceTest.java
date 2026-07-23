package com.im.server.service;

import com.im.common.dto.FileUploadTaskCreateRequest;
import com.im.common.dto.FileUploadTaskVO;
import com.im.common.entity.ImFile;
import com.im.common.entity.ImFileUpload;
import com.im.common.entity.ImFileUploadPart;
import com.im.common.exception.BusinessException;
import com.im.server.config.FileStorageProperties;
import com.im.server.mapper.FileMapper;
import com.im.server.mapper.FileUploadMapper;
import com.im.server.mapper.FileUploadPartMapper;
import com.im.server.service.storage.FileStorageClient;
import com.im.server.service.storage.FileStorageRouter;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FileUploadTaskServiceTest {

    @Mock private FileUploadMapper uploadMapper;
    @Mock private FileUploadPartMapper uploadPartMapper;
    @Mock private FileMapper fileMapper;
    @Mock private FileMetadataService metadataService;
    @Mock private FileStorageClient storageClient;
    @Mock private FileStorageRouter storageRouter;
    @Mock private FileStorageProperties properties;

    @InjectMocks private FileUploadTaskService service;

    @Test
    void createsMultipartTaskWithServerChunkParameters() {
        when(properties.getMaxSize()).thenReturn(50L);
        when(properties.getChunkSize()).thenReturn(4L);
        when(properties.getUploadRetentionHours()).thenReturn(24);
        when(storageRouter.defaultClient()).thenReturn(storageClient);
        when(storageClient.storageType()).thenReturn("local");
        when(storageClient.bucket()).thenReturn("local");

        FileUploadTaskVO result = service.createTask(request(10L, null), 7L);

        assertThat(result.getChunkCount()).isEqualTo(3);
        assertThat(result.getChunkSize()).isEqualTo(4L);
        assertThat(result.getStatus()).isEqualTo("UPLOADING");
        assertThat(result.getExpiresAt()).isNotNull();
        ArgumentCaptor<ImFileUpload> captor = ArgumentCaptor.forClass(ImFileUpload.class);
        verify(uploadMapper).insert(captor.capture());
        assertThat(captor.getValue().getUploaderId()).isEqualTo(7L);
    }

    @Test
    void sameConversationHashUsesSecondTransfer() {
        when(properties.getMaxSize()).thenReturn(50L);
        when(properties.getChunkSize()).thenReturn(4L);
        ImFile existing = new ImFile();
        existing.setId(88L);
        existing.setStorageType("local");
        when(fileMapper.selectOne(any())).thenReturn(existing);

        FileUploadTaskVO result = service.createTask(request(10L, "abc"), 7L);

        assertThat(result.getFileExists()).isTrue();
        assertThat(result.getFileId()).isEqualTo(88L);
        assertThat(result.getUploadMode()).isEqualTo("second_transfer");
        assertThat(result.getStatus()).isEqualTo("COMPLETED");
    }

    @Test
    void rejectsChunkWhoseSizeIsNotExact() {
        ImFileUpload upload = activeUpload(6L, 4L, 2);
        when(uploadMapper.selectOwnedForUpdate(any(), any())).thenReturn(upload);
        MockMultipartFile shortPart = new MockMultipartFile("file", "part", "application/octet-stream", new byte[3]);

        assertThatThrownBy(() -> service.uploadPart(upload.getUploadId(), 1, shortPart, 7L))
                .isInstanceOf(BusinessException.class)
                .hasMessage("Chunk size does not match expected size");
    }

    @Test
    void uploadsExactChunkAndReturnsPartState() throws Exception {
        ImFileUpload upload = activeUpload(6L, 4L, 2);
        when(uploadMapper.selectOwnedForUpdate(any(), any())).thenReturn(upload);
        when(storageRouter.clientFor("local", "local")).thenReturn(storageClient);
        when(uploadPartMapper.selectOne(any())).thenReturn(null);
        when(uploadPartMapper.selectList(any())).thenReturn(List.of());
        MockMultipartFile part = new MockMultipartFile("file", "part", "application/octet-stream", new byte[4]);

        service.uploadPart(upload.getUploadId(), 1, part, 7L);

        verify(storageClient).saveChunk(eq("chunks/upload-1/1"), eq(part));
        verify(uploadPartMapper).insert(any(ImFileUploadPart.class));
    }

    @Test
    void completedTaskCanBeCompletedAgain() {
        ImFileUpload upload = activeUpload(6L, 4L, 2);
        upload.setStatus("COMPLETED");
        upload.setFileId(99L);
        ImFile file = new ImFile();
        file.setId(99L);
        when(uploadMapper.selectOwnedForUpdate(any(), any())).thenReturn(upload);
        when(metadataService.getById(99L)).thenReturn(file);

        assertThat(service.completeTask(upload.getUploadId(), null, 7L)).isSameAs(file);
    }

    @Test
    void completesAllChunksAndDeletesParts() throws Exception {
        ImFileUpload upload = activeUpload(6L, 4L, 2);
        ImFileUploadPart first = part(1, 4L, "chunks/upload-1/1");
        ImFileUploadPart second = part(2, 2L, "chunks/upload-1/2");
        ImFile completed = new ImFile();
        completed.setId(99L);
        when(uploadMapper.selectOwnedForUpdate(any(), any())).thenReturn(upload);
        when(uploadPartMapper.selectList(any())).thenReturn(List.of(first, second));
        when(storageRouter.clientFor("local", "local")).thenReturn(storageClient);
        when(metadataService.createAvailableFile(any(), any(), any(), any(), any(), any(), any(), any(), any(), eq(false), any()))
                .thenReturn(completed);

        ImFile result = service.completeTask(upload.getUploadId(), null, 7L);

        assertThat(result).isSameAs(completed);
        verify(storageClient).compose(eq(upload.getObjectKey()), anyList(), eq(6L), eq(upload.getContentType()));
        verify(storageClient).deleteQuietly(first.getObjectKey());
        verify(storageClient).deleteQuietly(second.getObjectKey());
        assertThat(upload.getStatus()).isEqualTo("COMPLETED");
    }

    @Test
    void cancelDeletesChunksAndMarksTaskAborted() {
        ImFileUpload upload = activeUpload(6L, 4L, 2);
        ImFileUploadPart first = part(1, 4L, "chunks/upload-1/1");
        when(uploadMapper.selectOwnedForUpdate(any(), any())).thenReturn(upload);
        when(uploadPartMapper.selectList(any())).thenReturn(List.of(first));
        when(storageRouter.clientFor("local", "local")).thenReturn(storageClient);

        service.cancelTask(upload.getUploadId(), 7L);

        verify(storageClient).deleteQuietly(first.getObjectKey());
        verify(uploadPartMapper).delete(any());
        assertThat(upload.getStatus()).isEqualTo("ABORTED");
        verify(uploadMapper).updateById(upload);
    }

    private FileUploadTaskCreateRequest request(long size, String sha256) {
        FileUploadTaskCreateRequest request = new FileUploadTaskCreateRequest();
        request.setConversationId(3L);
        request.setFileName("report.bin");
        request.setFileSize(size);
        request.setContentType("application/octet-stream");
        request.setSha256(sha256);
        return request;
    }

    private ImFileUpload activeUpload(long size, long chunkSize, int totalParts) {
        ImFileUpload upload = new ImFileUpload();
        upload.setUploadId("upload-1");
        upload.setUploaderId(7L);
        upload.setConversationId(3L);
        upload.setFileName("report.bin");
        upload.setFileSize(size);
        upload.setContentType("application/octet-stream");
        upload.setChunkSize(chunkSize);
        upload.setTotalParts(totalParts);
        upload.setStorageType("local");
        upload.setBucket("local");
        upload.setObjectKey("files/report.bin");
        upload.setStatus("UPLOADING");
        upload.setExpiresAt(LocalDateTime.now().plusHours(1));
        return upload;
    }

    private ImFileUploadPart part(int number, long size, String key) {
        ImFileUploadPart part = new ImFileUploadPart();
        part.setUploadId("upload-1");
        part.setPartNumber(number);
        part.setPartSize(size);
        part.setObjectKey(key);
        part.setStatus("UPLOADED");
        return part;
    }
}
