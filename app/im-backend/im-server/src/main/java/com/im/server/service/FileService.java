package com.im.server.service;

import com.im.common.dto.FileTransferInitRequest;
import com.im.common.dto.FileTransferStatusRequest;
import com.im.common.dto.FileTransferVO;
import com.im.common.dto.FileUploadCompleteRequest;
import com.im.common.dto.FileUploadInitRequest;
import com.im.common.dto.FileUploadVO;
import com.im.common.dto.FileVO;
import com.im.common.entity.ImFile;
import com.im.common.result.PageResult;
import com.im.server.service.storage.StoredObject;
import org.springframework.web.multipart.MultipartFile;

public interface FileService {

    ImFile upload(MultipartFile file, Long uploaderId);

    ImFile upload(MultipartFile file, Long uploaderId, boolean temporary);

    ImFile upload(MultipartFile file, Long uploaderId, Long conversationId, boolean temporary);

    ImFile getById(Long id);

    FileTransferVO initTransfer(Long userId, FileTransferInitRequest request);

    FileTransferVO updateTransferStatus(Long userId, String transferId, FileTransferStatusRequest request);

    FileTransferVO fallbackTransfer(Long userId, String transferId, FileTransferStatusRequest request);

    FileUploadVO initUpload(Long userId, FileUploadInitRequest request);

    FileUploadVO getUploadStatus(Long userId, String uploadId);

    FileUploadVO uploadChunk(Long userId, String uploadId, Integer partNumber, MultipartFile file);

    FileVO completeUpload(Long userId, String uploadId, FileUploadCompleteRequest request);

    PageResult<FileVO> listConversationFiles(Long userId, Long conversationId, String type, String keyword, int page, int pageSize);

    void abortUpload(Long userId, String uploadId);

    ImFile getDownloadableFile(Long userId, Long fileId);

    StoredObject openFile(ImFile file, long offset, Long length);

    void incrementDownloadCount(Long fileId);

    void validateFileMessage(Long senderId, Long conversationId, String content);

    void cleanupExpiredTemporaryFiles();

    void cleanupExpiredUploads();
}
