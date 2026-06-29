package com.im.server.controller;

import com.im.common.dto.FileTransferInitRequest;
import com.im.common.dto.FileTransferStatusRequest;
import com.im.common.dto.FileTransferVO;
import com.im.common.dto.FileUploadCompleteRequest;
import com.im.common.dto.FileUploadInitRequest;
import com.im.common.dto.FileUploadVO;
import com.im.common.dto.FileVO;
import com.im.common.entity.ImFile;
import com.im.common.entity.SysUser;
import com.im.common.exception.BusinessException;
import com.im.common.result.Result;
import com.im.server.service.FileService;
import com.im.server.service.UserService;
import com.im.server.service.storage.StoredObject;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * ?????FileController exposes HTTP endpoints and keeps request validation close to the API boundary.
 */
@RestController
@RequestMapping("/api/files")
public class FileController {

    private final FileService fileService;
    private final UserService userService;

    public FileController(FileService fileService, UserService userService) {
        this.fileService = fileService;
        this.userService = userService;
    }

    @PostMapping("/upload")
    public Result<Map<String, Object>> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "conversationId", required = false) Long conversationId) {
        Long userId = getCurrentUserId();
        ImFile result = fileService.upload(file, userId, conversationId, true);
        return Result.success(toLegacyUploadResponse(result));
    }

    @PostMapping("/upload/avatar")
    public Result<Map<String, Object>> uploadAvatar(@RequestParam("file") MultipartFile file) {
        Long userId = getCurrentUserId();
        ImFile result = fileService.upload(file, userId, false);

        SysUser user = userService.getById(userId);
        user.setAvatar("/api/files/download/" + result.getId());
        userService.update(user);

        return Result.success(toLegacyUploadResponse(result));
    }

    @PostMapping("/transfer/init")
    public Result<FileTransferVO> initTransfer(@RequestBody FileTransferInitRequest request) {
        return Result.success(fileService.initTransfer(getCurrentUserId(), request));
    }

    @PostMapping("/transfer/{transferId}/status")
    public Result<FileTransferVO> updateTransferStatus(
            @PathVariable String transferId,
            @RequestBody(required = false) FileTransferStatusRequest request) {
        FileTransferStatusRequest body = request != null ? request : new FileTransferStatusRequest();
        return Result.success(fileService.updateTransferStatus(getCurrentUserId(), transferId, body));
    }

    @PostMapping("/transfer/{transferId}/fallback")
    public Result<FileTransferVO> fallbackTransfer(
            @PathVariable String transferId,
            @RequestBody(required = false) FileTransferStatusRequest request) {
        FileTransferStatusRequest body = request != null ? request : new FileTransferStatusRequest();
        return Result.success(fileService.fallbackTransfer(getCurrentUserId(), transferId, body));
    }

    @PostMapping("/uploads/init")
    public Result<FileUploadVO> initUpload(@RequestBody FileUploadInitRequest request) {
        return Result.success(fileService.initUpload(getCurrentUserId(), request));
    }

    @GetMapping("/uploads/{uploadId}")
    public Result<FileUploadVO> getUploadStatus(@PathVariable String uploadId) {
        return Result.success(fileService.getUploadStatus(getCurrentUserId(), uploadId));
    }

    @PostMapping("/uploads/{uploadId}/chunks/{partNumber}")
    public Result<FileUploadVO> uploadChunk(
            @PathVariable String uploadId,
            @PathVariable Integer partNumber,
            @RequestParam("file") MultipartFile file) {
        return Result.success(fileService.uploadChunk(getCurrentUserId(), uploadId, partNumber, file));
    }

    @PostMapping("/uploads/{uploadId}/complete")
    public Result<FileVO> completeUpload(
            @PathVariable String uploadId,
            @RequestBody(required = false) FileUploadCompleteRequest request) {
        FileUploadCompleteRequest body = request != null ? request : new FileUploadCompleteRequest();
        return Result.success(fileService.completeUpload(getCurrentUserId(), uploadId, body));
    }

    @PostMapping("/uploads/{uploadId}/abort")
    public Result<Void> abortUpload(@PathVariable String uploadId) {
        fileService.abortUpload(getCurrentUserId(), uploadId);
        return Result.ok();
    }

    @GetMapping("/download/{fileId}")
    public ResponseEntity<?> download(
            @PathVariable Long fileId,
            @RequestHeader(value = "Range", required = false) String rangeHeader) {
        try {
            ImFile imFile = fileService.getDownloadableFile(getOptionalCurrentUserId(), fileId);
            Range range = parseRange(rangeHeader, imFile.getFileSize());
            StoredObject object = fileService.openFile(imFile, range.start, range.length);
            fileService.incrementDownloadCount(fileId);

            HttpHeaders headers = new HttpHeaders();
            headers.set(HttpHeaders.CONTENT_DISPOSITION, contentDisposition(imFile));
            headers.set(HttpHeaders.ACCEPT_RANGES, "bytes");
            headers.setContentLength(range.length);
            if (range.partial) {
                headers.set(HttpHeaders.CONTENT_RANGE,
                        "bytes " + range.start + "-" + range.end + "/" + imFile.getFileSize());
            }

            String contentType = imFile.getContentType();
            if (contentType == null || contentType.isBlank()) {
                contentType = object.getContentType();
            }
            headers.setContentType(MediaType.parseMediaType(
                    contentType != null ? contentType : MediaType.APPLICATION_OCTET_STREAM_VALUE));
            return new ResponseEntity<>(
                    new InputStreamResource(object.getInputStream()),
                    headers,
                    range.partial ? HttpStatus.PARTIAL_CONTENT : HttpStatus.OK);
        } catch (BusinessException e) {
            return ResponseEntity.status(toHttpStatus(e.getCode()))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Result.error(e.getCode(), e.getMessage()));
        }
    }

    @PostMapping("/ack/{fileId}")
    public Result<Void> acknowledgeDownload(@PathVariable Long fileId) {
        fileService.getDownloadableFile(getCurrentUserId(), fileId);
        return Result.ok();
    }

    private Map<String, Object> toLegacyUploadResponse(ImFile file) {
        Map<String, Object> data = new HashMap<>();
        data.put("id", file.getId());
        data.put("fileId", file.getId());
        data.put("originalName", file.getOriginalName());
        data.put("size", file.getFileSize());
        data.put("contentType", file.getContentType());
        data.put("sha256", file.getSha256());
        data.put("status", file.getStatus());
        data.put("expiresAt", file.getExpiresAt());
        data.put("url", "/api/files/download/" + file.getId());
        return data;
    }

    private String contentDisposition(ImFile imFile) {
        String encoded = URLEncoder.encode(imFile.getOriginalName(), StandardCharsets.UTF_8).replace("+", "%20");
        String mode = imFile.getContentType() != null && imFile.getContentType().startsWith("image/") ? "inline" : "attachment";
        return mode + "; filename*=UTF-8''" + encoded;
    }

    private HttpStatus toHttpStatus(int code) {
        if (code == 403) return HttpStatus.FORBIDDEN;
        if (code == 404) return HttpStatus.NOT_FOUND;
        if (code == 410) return HttpStatus.GONE;
        if (code == 413) return HttpStatus.PAYLOAD_TOO_LARGE;
        if (code >= 400 && code < 500) return HttpStatus.BAD_REQUEST;
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }

    private Range parseRange(String rangeHeader, long totalSize) {
        if (rangeHeader == null || !rangeHeader.startsWith("bytes=")) {
            return new Range(0, totalSize - 1, totalSize, false);
        }
        String[] parts = rangeHeader.substring("bytes=".length()).split("-", 2);
        long start = parts[0].isBlank() ? 0 : Long.parseLong(parts[0]);
        long end = parts.length > 1 && !parts[1].isBlank() ? Long.parseLong(parts[1]) : totalSize - 1;
        start = Math.max(0, Math.min(start, totalSize - 1));
        end = Math.max(start, Math.min(end, totalSize - 1));
        return new Range(start, end, end - start + 1, true);
    }

    private Long getCurrentUserId() {
        String userIdStr = (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return Long.parseLong(userIdStr);
    }

    private Long getOptionalCurrentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication.getPrincipal() == null) {
            return null;
        }
        Object principal = authentication.getPrincipal();
        if (!(principal instanceof String userIdStr)) {
            return null;
        }
        try {
            return Long.parseLong(userIdStr);
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private record Range(long start, long end, long length, boolean partial) {
    }
}
