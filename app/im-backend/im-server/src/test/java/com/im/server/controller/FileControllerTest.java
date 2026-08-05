package com.im.server.controller;

import com.im.common.entity.ImFile;
import com.im.server.service.FileDownloadService;
import com.im.server.service.FileMetadataService;
import com.im.server.service.FileUploadService;
import com.im.server.service.FileUploadTaskService;
import com.im.server.service.UserService;
import com.im.server.service.storage.StoredObject;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.io.ByteArrayInputStream;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 文件下载控制器测试，验证 HTTP Range 请求的断点续传和 416 响应。
 *
 * <p>测试范围：FileController 的文件下载端点，覆盖精确 Range、后缀 Range、越界 Range 三种场景。</p>
 */
class FileControllerTest {

    private FileDownloadService downloadService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        downloadService = mock(FileDownloadService.class);
        FileController controller = new FileController(
                mock(FileUploadService.class),
                mock(FileUploadTaskService.class),
                downloadService,
                mock(FileMetadataService.class),
                mock(UserService.class));
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /**
     * 验证精确 Range（bytes=2-5）返回 206 Partial Content，
     * Content-Range 和 Content-Length 正确，下载计数递增。
     */
    @Test
    void returnsExactPartialContent() throws Exception {
        ImFile file = downloadableFile();
        when(downloadService.getDownloadableFile(isNull(), eq(1L))).thenReturn(file);
        when(downloadService.openFile(file, 2, 4L)).thenReturn(new StoredObject(
                new ByteArrayInputStream("2345".getBytes()), 4, "application/octet-stream"));

        mockMvc.perform(get("/api/files/download/1").header("Range", "bytes=2-5"))
                .andExpect(status().isPartialContent())
                .andExpect(header().string("Content-Range", "bytes 2-5/10"))
                .andExpect(header().string("Content-Length", "4"))
                .andExpect(content().bytes("2345".getBytes()));
        verify(downloadService).incrementDownloadCount(1L);
    }

    /**
     * 验证后缀 Range（bytes=-3，取最后 3 字节）返回 206，Content-Range 计算正确。
     */
    @Test
    void supportsSuffixRange() throws Exception {
        ImFile file = downloadableFile();
        when(downloadService.getDownloadableFile(isNull(), eq(1L))).thenReturn(file);
        when(downloadService.openFile(file, 7, 3L)).thenReturn(new StoredObject(
                new ByteArrayInputStream("789".getBytes()), 3, "application/octet-stream"));

        mockMvc.perform(get("/api/files/download/1").header("Range", "bytes=-3"))
                .andExpect(status().isPartialContent())
                .andExpect(header().string("Content-Range", "bytes 7-9/10"))
                .andExpect(content().bytes("789".getBytes()));
    }

    /**
     * 验证越界 Range（bytes=20-30，超出文件大小）返回 416 Range Not Satisfiable，
     * 且 Content-Range 为 "bytes *&#47;10"。
     */
    @Test
    void rejectsUnsatisfiableRangeWith416() throws Exception {
        ImFile file = downloadableFile();
        when(downloadService.getDownloadableFile(isNull(), eq(1L))).thenReturn(file);
        when(downloadService.getFileSize(1L)).thenReturn(10L);

        mockMvc.perform(get("/api/files/download/1").header("Range", "bytes=20-30"))
                .andExpect(status().isRequestedRangeNotSatisfiable())
                .andExpect(header().string("Content-Range", "bytes */10"));
    }

    private ImFile downloadableFile() {
        ImFile file = new ImFile();
        file.setId(1L);
        file.setOriginalName("sample.bin");
        file.setFileSize(10L);
        file.setContentType("application/octet-stream");
        return file;
    }
}
