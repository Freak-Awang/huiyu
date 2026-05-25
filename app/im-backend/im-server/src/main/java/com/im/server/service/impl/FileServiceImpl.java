package com.im.server.service.impl;

import com.im.common.entity.ImFile;
import com.im.server.mapper.FileMapper;
import com.im.server.service.FileService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class FileServiceImpl implements FileService {

    @Autowired
    private FileMapper fileMapper;

    @Value("${file.upload.path:./upload}")
    private String uploadPath;

    @Override
    public ImFile upload(MultipartFile file, Long uploaderId) {
        return upload(file, uploaderId, true);
    }

    @Override
    public ImFile upload(MultipartFile file, Long uploaderId, boolean temporary) {
        try {
            Path uploadDir = Paths.get(uploadPath);
            if (Files.notExists(uploadDir)) {
                Files.createDirectories(uploadDir);
            }

            String originalName = file.getOriginalFilename();
            String extension = "";
            if (originalName != null && originalName.contains(".")) {
                extension = originalName.substring(originalName.lastIndexOf("."));
            }
            String storedName = UUID.randomUUID().toString() + extension;

            Path destPath = Paths.get(uploadPath, storedName);
            file.transferTo(destPath.toFile());

            ImFile imFile = new ImFile();
            imFile.setOriginalName(originalName);
            imFile.setStoredName(storedName);
            imFile.setFilePath(uploadPath + "/" + storedName);
            imFile.setFileSize(file.getSize());
            imFile.setContentType(file.getContentType());
            imFile.setUploaderId(uploaderId);
            imFile.setCreateTime(LocalDateTime.now());
            imFile.setTemporary(temporary ? 1 : 0);
            imFile.setExpiresAt(temporary ? LocalDateTime.now().plusDays(7) : null);

            fileMapper.insert(imFile);

            return imFile;
        } catch (IOException e) {
            throw new RuntimeException("Failed to upload file", e);
        }
    }

    @Override
    public ImFile getById(Long id) {
        return fileMapper.selectById(id);
    }

    @Override
    public void cleanupExpiredTemporaryFiles() {
        List<ImFile> expiredFiles = fileMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ImFile>()
                        .eq(ImFile::getTemporary, 1)
                        .lt(ImFile::getExpiresAt, LocalDateTime.now()));
        for (ImFile imFile : expiredFiles) {
            try {
                Files.deleteIfExists(Paths.get(imFile.getFilePath()));
            } catch (IOException ignored) {
                // Keep deleting database records so expired links stop working even if the file was already gone.
            }
            fileMapper.deleteById(imFile.getId());
        }
    }
}
