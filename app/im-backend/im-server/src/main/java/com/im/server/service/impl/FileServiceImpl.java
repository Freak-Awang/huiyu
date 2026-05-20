package com.im.server.service.impl;

import com.im.common.entity.ImFile;
import com.im.server.mapper.FileMapper;
import com.im.server.service.FileService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.UUID;

@Service
public class FileServiceImpl implements FileService {

    @Autowired
    private FileMapper fileMapper;

    @Value("${file.upload.path:./upload}")
    private String uploadPath;

    @Override
    public ImFile upload(MultipartFile file, Long uploaderId) {
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
}
