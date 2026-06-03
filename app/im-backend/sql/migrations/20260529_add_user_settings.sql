CREATE TABLE IF NOT EXISTS im_user_settings (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT 'settings id',
    user_id BIGINT NOT NULL COMMENT 'user id',
    general_settings JSON NOT NULL COMMENT 'general settings',
    notification_settings JSON NOT NULL COMMENT 'notification settings',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
    UNIQUE KEY uk_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='user settings';
