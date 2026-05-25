package com.im.server.controller;

import com.im.common.entity.ImFile;
import com.im.common.entity.SysUser;
import com.im.common.result.Result;
import com.im.server.service.FileService;
import com.im.server.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/files")
public class FileController {

    @Autowired
    private FileService fileService;

    @Autowired
    private UserService userService;

    @Value("${file.upload.path:./upload}")
    private String uploadPath;

    @PostMapping("/upload")
    public Result<Map<String, Object>> upload(@RequestParam("file") MultipartFile file) {
        Long userId = getCurrentUserId();
        ImFile result = fileService.upload(file, userId, true);

        Map<String, Object> data = new HashMap<>();
        data.put("id", result.getId());
        data.put("originalName", result.getOriginalName());
        data.put("url", "/api/files/download/" + result.getId());

        return Result.success(data);
    }

    @PostMapping("/upload/avatar")
    public Result<Map<String, Object>> uploadAvatar(@RequestParam("file") MultipartFile file) {
        Long userId = getCurrentUserId();
        ImFile result = fileService.upload(file, userId, false);

        SysUser user = userService.getById(userId);
        user.setAvatar("/api/files/download/" + result.getId());
        userService.update(user);

        Map<String, Object> data = new HashMap<>();
        data.put("url", "/api/files/download/" + result.getId());

        return Result.success(data);
    }

    @GetMapping("/download/{fileId}")
    public ResponseEntity<Resource> download(@PathVariable Long fileId) {
        ImFile imFile = fileService.getById(fileId);
        if (imFile == null) {
            return ResponseEntity.notFound().build();
        }

        File file = new File(imFile.getFilePath());
        if (!file.exists()) {
            return ResponseEntity.notFound().build();
        }

        FileSystemResource resource = new FileSystemResource(file);

        String contentType = imFile.getContentType();
        if (contentType == null || contentType.isEmpty()) {
            try {
                contentType = Files.probeContentType(Paths.get(imFile.getFilePath()));
            } catch (IOException e) {
                contentType = MediaType.APPLICATION_OCTET_STREAM_VALUE;
            }
        }
        if (contentType == null) {
            contentType = MediaType.APPLICATION_OCTET_STREAM_VALUE;
        }

        String disposition;
        if (contentType.startsWith("image/")) {
            disposition = "inline";
        } else {
            disposition = "attachment; filename=\"" + imFile.getOriginalName() + "\"";
        }

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .body(resource);
    }

    @PostMapping("/ack/{fileId}")
    public Result<Void> acknowledgeDownload(@PathVariable Long fileId) {
        ImFile imFile = fileService.getById(fileId);
        if (imFile == null) {
            return Result.error(404, "File not found");
        }
        return Result.ok();
    }

    private Long getCurrentUserId() {
        String userIdStr = (String) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return Long.parseLong(userIdStr);
    }
}
