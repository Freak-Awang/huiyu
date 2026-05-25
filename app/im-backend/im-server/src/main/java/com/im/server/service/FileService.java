package com.im.server.service;

import com.im.common.entity.ImFile;
import org.springframework.web.multipart.MultipartFile;

public interface FileService {

    ImFile upload(MultipartFile file, Long uploaderId);

    ImFile upload(MultipartFile file, Long uploaderId, boolean temporary);

    ImFile getById(Long id);

    void cleanupExpiredTemporaryFiles();
}
