package com.im.server.config;

import com.im.server.service.FileService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class RetentionCleanupJob {

    private static final Logger log = LoggerFactory.getLogger(RetentionCleanupJob.class);

    private final FileService fileService;

    public RetentionCleanupJob(FileService fileService) {
        this.fileService = fileService;
    }

    @Scheduled(cron = "${retention.cleanup.cron:0 15 3 * * *}")
    public void cleanupExpiredContent() {
        try {
            fileService.cleanupExpiredTemporaryFiles();
        } catch (Exception e) {
            log.error("Retention cleanup failed", e);
        }
    }

    @Scheduled(cron = "${retention.upload-cleanup.cron:0 0 * * * *}")
    public void cleanupExpiredUploads() {
        try {
            fileService.cleanupExpiredUploads();
        } catch (Exception e) {
            log.error("Upload cleanup failed", e);
        }
    }
}
