package com.im.server.controller;

import com.im.common.dto.FileVO;
import com.im.common.entity.ImFile;
import com.im.common.entity.SysUser;
import com.im.common.exception.BusinessException;
import com.im.common.result.Result;
import com.im.server.service.FileDownloadService;
import com.im.server.service.FileMetadataService;
import com.im.server.service.FileUploadService;
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
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Intent: FileController exposes HTTP endpoints and keeps request validation close to the API boundary.
 */
@RestController
@RequestMapping("/api/files")
public class FileController {

    private final FileUploadService fileUploadService;
    private final FileDownloadService fileDownloadService;
    private final FileMetadataService fileMetadataService;
    private final UserService userService;

    public FileController(
            FileUploadService fileUploadService,
            FileDownloadService fileDownloadService,
            FileMetadataService fileMetadataService,
            UserService userService) {
        this.fileUploadService = fileUploadService;
        this.fileDownloadService = fileDownloadService;
        this.fileMetadataService = fileMetadataService;
        this.userService = userService;
    }

    @PostMapping("/upload")
    public Result<FileVO> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "conversationId", required = false) Long conversationId) {
        Long userId = getCurrentUserId();
        ImFile result = conversationId != null
                ? fileUploadService.uploadConversationImage(file, userId, conversationId)
                : fileUploadService.uploadStandaloneImage(file, userId);
        return Result.success(toFileVO(result));
    }

    @PostMapping("/upload/avatar")
    public Result<FileVO> uploadAvatar(@RequestParam("file") MultipartFile file) {
        Long userId = getCurrentUserId();
        ImFile result = fileUploadService.uploadAvatarFile(file, userId);

        SysUser user = userService.getById(userId);
        user.setAvatar("/api/files/download/" + result.getId());
        userService.update(user);

        return Result.success(toFileVO(result));
    }

    @GetMapping("/download/{fileId}")
    public ResponseEntity<?> download(
            @PathVariable Long fileId,
            @RequestHeader(value = "Range", required = false) String rangeHeader) {
        try {
            ImFile imFile = fileDownloadService.getDownloadableFile(getOptionalCurrentUserId(), fileId);
            Range range = parseRange(rangeHeader, imFile.getFileSize());
            StoredObject object = fileDownloadService.openFile(imFile, range.start, range.length);
            fileDownloadService.incrementDownloadCount(fileId);

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

    private FileVO toFileVO(ImFile file) {
        return fileMetadataService.toFileVO(file);
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
