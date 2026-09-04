package com.im.server.controller;

import com.im.common.dto.FileVO;
import com.im.common.entity.ImFile;
import com.im.common.exception.BusinessException;
import com.im.common.result.Result;
import com.im.server.service.FileDownloadService;
import com.im.server.service.FileMetadataService;
import com.im.server.service.ImageTypeDetector;
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
 * 文件控制器。
 * <p>
 * 仅提供聊天图片、头像等媒体资源的上传和读取。
 * 普通 FILE/FOLDER 附件只允许通过 P2P DataChannel 传输。
 * </p>
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

    /**
     * 上传聊天图片。普通文件不得使用该接口。
     *
     * @param file           上传的文件
     * @param conversationId 关联会话 ID（可选）
     * @return 文件信息
     */
    @PostMapping("/upload/image")
    public Result<FileVO> uploadImage(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "conversationId", required = false) Long conversationId) {
        Long userId = getCurrentUserId();
        ImFile result = conversationId != null
                ? fileUploadService.uploadConversationImage(file, userId, conversationId)
                : fileUploadService.uploadStandaloneImage(file, userId);
        return Result.success(toFileVO(result));
    }

    /**
     * 上传用户头像。
     *
     * @param file 头像文件
     * @return 文件信息
     */
    @PostMapping("/upload/avatar")
    public Result<FileVO> uploadAvatar(@RequestParam("file") MultipartFile file) {
        Long userId = getCurrentUserId();
        ImFile result = fileUploadService.uploadAvatarFile(file, userId);

        userService.updateAvatar(userId, "/api/files/download/" + result.getId());

        return Result.success(toFileVO(result));
    }

    /**
     * 读取图片媒体，支持 HTTP Range。
     *
     * @param fileId      文件 ID
     * @param rangeHeader Range 请求头（可选）
     * @return 文件流响应
     */
    @GetMapping("/download/{fileId}")
    public ResponseEntity<?> download(
            @PathVariable Long fileId,
            @RequestHeader(value = "Range", required = false) String rangeHeader) {
        try {
            ImFile imFile = fileDownloadService.getDownloadableFile(getOptionalCurrentUserId(), fileId);
            if (!ImageTypeDetector.isSafeInlineType(imFile.getContentType())) {
                throw new BusinessException(410, "Server-backed file attachments are no longer available");
            }
            Range range = parseRange(rangeHeader, imFile.getFileSize());
            StoredObject object = fileDownloadService.openFile(imFile, range.start, range.length);
            fileDownloadService.incrementDownloadCount(fileId);

            HttpHeaders headers = new HttpHeaders();
            headers.set(HttpHeaders.CONTENT_DISPOSITION, contentDisposition(imFile));
            headers.set(HttpHeaders.ACCEPT_RANGES, "bytes");
            headers.set("X-Content-Type-Options", "nosniff");
            headers.set("Content-Security-Policy", "sandbox; default-src 'none'");
            headers.setContentLength(range.length);
            if (range.partial) {
                headers.set(HttpHeaders.CONTENT_RANGE,
                        "bytes " + range.start + "-" + range.end + "/" + imFile.getFileSize());
            }

            String contentType = imFile.getContentType();
            if (contentType == null || contentType.isBlank()) {
                contentType = object.getContentType();
            }
            try {
                headers.setContentType(MediaType.parseMediaType(
                        contentType != null ? contentType : MediaType.APPLICATION_OCTET_STREAM_VALUE));
            } catch (Exception ignored) {
                headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
            }
            return new ResponseEntity<>(
                    new InputStreamResource(object.getInputStream()),
                    headers,
                    range.partial ? HttpStatus.PARTIAL_CONTENT : HttpStatus.OK);
        } catch (BusinessException e) {
            return ResponseEntity.status(toHttpStatus(e.getCode()))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Result.error(e.getCode(), e.getMessage()));
        } catch (InvalidRangeException e) {
            return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                    .header(HttpHeaders.CONTENT_RANGE, "bytes */" + fileDownloadService.getFileSize(fileId))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Result.error(416, "Invalid byte range"));
        }
    }

    private FileVO toFileVO(ImFile file) {
        return fileMetadataService.toFileVO(file);
    }

    private String contentDisposition(ImFile imFile) {
        String encoded = URLEncoder.encode(imFile.getOriginalName(), StandardCharsets.UTF_8).replace("+", "%20");
        String mode = ImageTypeDetector.isSafeInlineType(imFile.getContentType()) ? "inline" : "attachment";
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
        try {
            return parseRangeValue(rangeHeader, totalSize);
        } catch (NumberFormatException e) {
            throw new InvalidRangeException();
        }
    }

    private Range parseRangeValue(String rangeHeader, long totalSize) {
        if (totalSize <= 0) {
            throw new InvalidRangeException();
        }
        if (rangeHeader == null) {
            return new Range(0, totalSize - 1, totalSize, false);
        }
        if (!rangeHeader.startsWith("bytes=")) {
            throw new InvalidRangeException();
        }
        String value = rangeHeader.substring("bytes=".length()).trim();
        if (value.contains(",")) {
            throw new InvalidRangeException();
        }
        String[] parts = value.split("-", 2);
        if (parts.length != 2 || (parts[0].isBlank() && parts[1].isBlank())) {
            throw new InvalidRangeException();
        }
        long start;
        long end;
        if (parts[0].isBlank()) {
            long suffixLength = Long.parseLong(parts[1]);
            if (suffixLength <= 0) throw new InvalidRangeException();
            suffixLength = Math.min(suffixLength, totalSize);
            start = totalSize - suffixLength;
            end = totalSize - 1;
        } else {
            start = Long.parseLong(parts[0]);
            if (start < 0 || start >= totalSize) throw new InvalidRangeException();
            end = parts[1].isBlank() ? totalSize - 1 : Long.parseLong(parts[1]);
            if (end < start) throw new InvalidRangeException();
            end = Math.min(end, totalSize - 1);
        }
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

    private static final class InvalidRangeException extends RuntimeException {
    }
}
