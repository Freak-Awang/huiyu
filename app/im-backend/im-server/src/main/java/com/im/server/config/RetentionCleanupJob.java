package com.im.server.config;

import com.im.server.service.FileRetentionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Intent: RetentionCleanupJob centralizes framework configuration so infrastructure behavior stays explicit.
 */
@Component
public class RetentionCleanupJob {

    private static final Logger log = LoggerFactory.getLogger(RetentionCleanupJob.class);

    private final FileRetentionService fileRetentionService;

    public RetentionCleanupJob(FileRetentionService fileRetentionService) {
        this.fileRetentionService = fileRetentionService;
    }

    @Scheduled(cron = "${retention.cleanup.cron:0 15 3 * * *}")
    public void cleanupExpiredContent() {
        try {
            // Temporary standalone files expire by policy; scheduled failure is logged but never blocks the app.
            fileRetentionService.cleanupExpiredTemporaryFiles();
        } catch (Exception e) {
            log.error("Retention cleanup failed", e);
        }
    }

}
