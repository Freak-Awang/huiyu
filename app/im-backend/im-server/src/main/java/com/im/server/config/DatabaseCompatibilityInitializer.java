package com.im.server.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class DatabaseCompatibilityInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DatabaseCompatibilityInitializer.class);

    private static final String CREATE_USER_SETTINGS_TABLE = """
            CREATE TABLE IF NOT EXISTS im_user_settings (
                id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT 'settings id',
                user_id BIGINT NOT NULL COMMENT 'user id',
                general_settings JSON NOT NULL COMMENT 'general settings',
                notification_settings JSON NOT NULL COMMENT 'notification settings',
                create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
                update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
                UNIQUE KEY uk_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='user settings'
            """;

    private final JdbcTemplate jdbcTemplate;

    public DatabaseCompatibilityInitializer(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        ensureUserSettingsTable();
    }

    private void ensureUserSettingsTable() {
        try {
            jdbcTemplate.execute(CREATE_USER_SETTINGS_TABLE);
            log.info("Database compatibility schema checked");
        } catch (DataAccessException e) {
            throw new IllegalStateException("Failed to initialize database compatibility schema", e);
        }
    }
}
