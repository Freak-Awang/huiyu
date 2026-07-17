CREATE TABLE IF NOT EXISTS im_client_release (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    version VARCHAR(32) NOT NULL,
    channel VARCHAR(16) NOT NULL DEFAULT 'stable',
    platform VARCHAR(16) NOT NULL DEFAULT 'win32',
    arch VARCHAR(16) NOT NULL DEFAULT 'x64',
    release_name VARCHAR(128) NOT NULL,
    release_notes TEXT NULL,
    minimum_version VARCHAR(32) NULL,
    force_update TINYINT(1) NOT NULL DEFAULT 0,
    rollout_percentage INT NOT NULL DEFAULT 100,
    update_base_url VARCHAR(512) NOT NULL,
    installer_name VARCHAR(255) NOT NULL,
    installer_size BIGINT NULL,
    installer_sha512 VARCHAR(256) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    published_at DATETIME NULL,
    created_by BIGINT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_client_release (version, channel, platform, arch),
    KEY idx_release_policy (channel, platform, arch, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='desktop client releases';

CREATE TABLE IF NOT EXISTS im_client_release_target (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    release_id BIGINT NOT NULL,
    target_type VARCHAR(16) NOT NULL,
    target_value VARCHAR(128) NOT NULL,
    mode VARCHAR(16) NOT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_release_target (release_id, target_type, target_value, mode),
    KEY idx_release_target_lookup (release_id, mode, target_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='release allow and deny targets';

CREATE TABLE IF NOT EXISTS im_client_update_event (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NULL,
    device_id VARCHAR(128) NOT NULL,
    current_version VARCHAR(32) NULL,
    target_version VARCHAR(32) NULL,
    event_type VARCHAR(32) NOT NULL,
    error_message VARCHAR(1000) NULL,
    platform VARCHAR(16) NULL,
    arch VARCHAR(16) NULL,
    channel VARCHAR(16) NOT NULL DEFAULT 'stable',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_update_device_version (device_id, target_version),
    KEY idx_update_event_created (event_type, create_time),
    KEY idx_update_release_stats (target_version, channel, event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='desktop update telemetry';

