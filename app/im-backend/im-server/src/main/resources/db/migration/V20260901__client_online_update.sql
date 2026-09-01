-- 桌面客户端在线更新模块（参照 IM_Update_System_Design v1.0）
-- 版本表 / 更新包表 / 灰度策略表 / 设备版本追踪表

CREATE TABLE IF NOT EXISTS app_version (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    version VARCHAR(20) NOT NULL COMMENT '版本号 如 3.2.5',
    build_number INT NOT NULL COMMENT '构建号 如 20260901',
    channel VARCHAR(20) NOT NULL DEFAULT 'stable' COMMENT 'stable/beta/alpha',
    update_type VARCHAR(16) NOT NULL DEFAULT 'full' COMMENT 'none/incremental/full/force',
    changelog TEXT NULL COMMENT '更新日志 JSON 数组',
    min_version VARCHAR(20) NULL COMMENT '最低兼容版本，低于此版本强制更新',
    force_deadline DATETIME NULL COMMENT '强制更新截止时间',
    status TINYINT NOT NULL DEFAULT 0 COMMENT '0-草稿 1-发布 2-下架',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_version_channel (version, channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户端版本';

CREATE TABLE IF NOT EXISTS update_package (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    version_id BIGINT NOT NULL COMMENT '关联 app_version.id',
    package_type VARCHAR(16) NOT NULL COMMENT 'full/patch',
    from_version VARCHAR(20) NULL COMMENT '增量补丁的起始版本',
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL COMMENT '服务器存储相对路径',
    file_size BIGINT NOT NULL,
    checksum_sha256 VARCHAR(64) NOT NULL,
    signature VARCHAR(512) NOT NULL DEFAULT '' COMMENT 'RSA 签名（Base64）',
    download_count INT NOT NULL DEFAULT 0,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_package_lookup (version_id, package_type, from_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户端更新包';

CREATE TABLE IF NOT EXISTS gray_strategy (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    version_id BIGINT NOT NULL COMMENT '关联 app_version.id',
    strategy_type VARCHAR(16) NOT NULL DEFAULT 'all' COMMENT 'all/gray/whitelist',
    gray_percent INT NOT NULL DEFAULT 100 COMMENT '灰度百分比 0-100',
    whitelist TEXT NULL COMMENT '白名单设备ID JSON 数组',
    start_time DATETIME NOT NULL,
    end_time DATETIME NULL,
    status TINYINT NOT NULL DEFAULT 1 COMMENT '0-停用 1-启用',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_gray_version (version_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='灰度发布策略';

CREATE TABLE IF NOT EXISTS device_version (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    device_id VARCHAR(64) NOT NULL COMMENT '客户端设备唯一标识',
    current_version VARCHAR(20) NOT NULL,
    current_build INT NOT NULL DEFAULT 0,
    channel VARCHAR(20) NOT NULL DEFAULT 'stable',
    last_check_time DATETIME NULL,
    last_update_time DATETIME NULL,
    update_count INT NOT NULL DEFAULT 0,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_device (device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='设备版本追踪';

CREATE TABLE IF NOT EXISTS client_update_event (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    device_id VARCHAR(64) NOT NULL,
    user_id BIGINT NULL,
    current_version VARCHAR(20) NULL,
    target_version VARCHAR(20) NULL,
    event_type VARCHAR(32) NOT NULL COMMENT 'check/download_success/download_failed/install_success/install_failed/rollback',
    error_message VARCHAR(1000) NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'stable',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_event_device (device_id, target_version),
    KEY idx_event_stats (target_version, channel, event_type),
    KEY idx_event_created (event_type, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户端更新遥测事件';
