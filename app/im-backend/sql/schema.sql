-- ============================================
-- IM Backend Database Schema
-- MySQL 8.0
-- ============================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS sys_user (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT 'user id',
    username VARCHAR(64) NOT NULL COMMENT 'login username',
    password VARCHAR(128) NOT NULL COMMENT 'BCrypt password',
    nickname VARCHAR(64) NOT NULL COMMENT 'display name',
    email VARCHAR(128) DEFAULT NULL COMMENT 'email',
    phone VARCHAR(20) DEFAULT NULL COMMENT 'phone',
    avatar VARCHAR(256) DEFAULT NULL COMMENT 'avatar URL',
    dept_id BIGINT DEFAULT NULL COMMENT 'department id',
    role VARCHAR(32) NOT NULL DEFAULT 'user' COMMENT 'admin/user',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '0=disabled, 1=enabled',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
    UNIQUE KEY uk_username (username),
    INDEX idx_dept_id (dept_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='users';

CREATE TABLE IF NOT EXISTS sys_dept (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT 'department id',
    name VARCHAR(64) NOT NULL COMMENT 'department name',
    parent_id BIGINT NOT NULL DEFAULT 0 COMMENT 'parent department id',
    sort_order INT NOT NULL DEFAULT 0 COMMENT 'sort order',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '0=disabled, 1=enabled',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
    INDEX idx_parent_id (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='departments';

CREATE TABLE IF NOT EXISTS im_conversation (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT 'conversation id',
    type TINYINT NOT NULL COMMENT '1=single, 2=group',
    name VARCHAR(128) DEFAULT NULL COMMENT 'group name',
    avatar VARCHAR(256) DEFAULT NULL COMMENT 'conversation avatar',
    owner_id BIGINT DEFAULT NULL COMMENT 'group owner id',
    announcement TEXT DEFAULT NULL COMMENT 'group announcement',
    announcement_updated_by BIGINT DEFAULT NULL COMMENT 'announcement updater user id',
    announcement_updated_at DATETIME DEFAULT NULL COMMENT 'announcement update time',
    last_message VARCHAR(512) DEFAULT NULL COMMENT 'last message preview',
    last_message_time DATETIME DEFAULT NULL COMMENT 'last message time',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
    INDEX idx_type (type),
    INDEX idx_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='conversations';

CREATE TABLE IF NOT EXISTS im_conversation_member (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT 'member id',
    conversation_id BIGINT NOT NULL COMMENT 'conversation id',
    user_id BIGINT NOT NULL COMMENT 'user id',
    role VARCHAR(32) NOT NULL DEFAULT 'member' COMMENT 'owner/admin/member',
    is_pinned TINYINT NOT NULL DEFAULT 0 COMMENT '0=no, 1=yes',
    is_muted TINYINT NOT NULL DEFAULT 0 COMMENT '0=no, 1=yes',
    last_read_time DATETIME DEFAULT NULL COMMENT 'last read time',
    join_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'join time',
    UNIQUE KEY uk_conv_user (conversation_id, user_id),
    INDEX idx_user_id (user_id),
    INDEX idx_pinned (is_pinned)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='conversation members';

CREATE TABLE IF NOT EXISTS im_message (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT 'message id',
    conversation_id BIGINT NOT NULL COMMENT 'conversation id',
    sender_id BIGINT NOT NULL COMMENT 'sender user id',
    message_type VARCHAR(32) NOT NULL COMMENT 'TEXT/IMAGE/FILE/STICKER',
    content TEXT NOT NULL COMMENT 'message content',
    status VARCHAR(32) NOT NULL DEFAULT 'SENT' COMMENT 'SENT/RECALLED',
    client_msg_id VARCHAR(64) DEFAULT NULL COMMENT 'client id for idempotency',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'sent time',
    expires_at DATETIME DEFAULT NULL COMMENT 'legacy retention expiry, null means permanent',
    INDEX idx_conv_time (conversation_id, create_time),
    INDEX idx_expires_at (expires_at),
    INDEX idx_sender (sender_id),
    UNIQUE KEY uk_client_msg (sender_id, client_msg_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='temporary messages';

CREATE TABLE IF NOT EXISTS im_message_delivery (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT 'delivery id',
    message_id BIGINT NOT NULL COMMENT 'message id',
    conversation_id BIGINT NOT NULL COMMENT 'conversation id',
    user_id BIGINT NOT NULL COMMENT 'recipient user id',
    delivered TINYINT NOT NULL DEFAULT 0 COMMENT '0=pending, 1=delivered',
    delivered_time DATETIME DEFAULT NULL COMMENT 'delivery ack time',
    read_status TINYINT NOT NULL DEFAULT 0 COMMENT '0=unread, 1=read',
    read_time DATETIME DEFAULT NULL COMMENT 'read time',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
    UNIQUE KEY uk_msg_user (message_id, user_id),
    INDEX idx_user_delivered (user_id, delivered, create_time),
    INDEX idx_conv_user_read (conversation_id, user_id, read_status),
    INDEX idx_message_id (message_id),
    INDEX idx_conversation_id (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='message delivery state';

CREATE TABLE IF NOT EXISTS im_file (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT 'file id',
    original_name VARCHAR(256) NOT NULL COMMENT 'original filename',
    stored_name VARCHAR(128) NOT NULL COMMENT 'stored filename',
    file_path VARCHAR(512) NOT NULL COMMENT 'file path',
    file_size BIGINT NOT NULL COMMENT 'file size bytes',
    content_type VARCHAR(128) DEFAULT NULL COMMENT 'MIME type',
    uploader_id BIGINT NOT NULL COMMENT 'uploader user id',
    conversation_id BIGINT DEFAULT NULL COMMENT 'conversation id',
    sha256 VARCHAR(64) DEFAULT NULL COMMENT 'file sha256',
    storage_type VARCHAR(32) NOT NULL DEFAULT 'local' COMMENT 'local/minio',
    bucket VARCHAR(128) DEFAULT NULL COMMENT 'storage bucket',
    object_key VARCHAR(512) DEFAULT NULL COMMENT 'storage object key',
    status VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE' COMMENT 'AVAILABLE/EXPIRED/BLOCKED',
    download_count INT NOT NULL DEFAULT 0 COMMENT 'download count',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'upload time',
    expires_at DATETIME DEFAULT NULL COMMENT 'temporary file expiry',
    temporary TINYINT NOT NULL DEFAULT 1 COMMENT '0=persistent, 1=temporary',
    INDEX idx_conversation_id (conversation_id),
    INDEX idx_sha256 (sha256),
    INDEX idx_status_expires (status, expires_at),
    INDEX idx_expires_temporary (temporary, expires_at),
    INDEX idx_uploader (uploader_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='files';

CREATE TABLE IF NOT EXISTS im_file_transfer (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT 'transfer row id',
    transfer_id VARCHAR(64) NOT NULL COMMENT 'client-visible transfer id',
    sender_id BIGINT NOT NULL COMMENT 'sender user id',
    conversation_id BIGINT NOT NULL COMMENT 'conversation id',
    file_name VARCHAR(256) NOT NULL COMMENT 'file name',
    file_size BIGINT NOT NULL COMMENT 'file size bytes',
    content_type VARCHAR(128) DEFAULT NULL COMMENT 'MIME type',
    sha256 VARCHAR(64) DEFAULT NULL COMMENT 'file sha256',
    mode VARCHAR(32) NOT NULL DEFAULT 'SERVER' COMMENT 'SERVER/P2P',
    status VARCHAR(32) NOT NULL COMMENT 'transfer status',
    file_id BIGINT DEFAULT NULL COMMENT 'completed file id',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
    expires_at DATETIME DEFAULT NULL COMMENT 'offline file expiry',
    UNIQUE KEY uk_transfer_id (transfer_id),
    INDEX idx_sender (sender_id),
    INDEX idx_conversation (conversation_id),
    INDEX idx_status_expires (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='file transfer tasks';

CREATE TABLE IF NOT EXISTS im_file_upload (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT 'upload row id',
    upload_id VARCHAR(64) NOT NULL COMMENT 'client-visible upload id',
    transfer_id VARCHAR(64) DEFAULT NULL COMMENT 'transfer id',
    uploader_id BIGINT NOT NULL COMMENT 'uploader user id',
    conversation_id BIGINT NOT NULL COMMENT 'conversation id',
    file_name VARCHAR(256) NOT NULL COMMENT 'file name',
    file_size BIGINT NOT NULL COMMENT 'file size bytes',
    content_type VARCHAR(128) DEFAULT NULL COMMENT 'MIME type',
    sha256 VARCHAR(64) DEFAULT NULL COMMENT 'file sha256',
    chunk_size BIGINT NOT NULL COMMENT 'chunk size bytes',
    total_parts INT NOT NULL COMMENT 'total part count',
    storage_type VARCHAR(32) NOT NULL DEFAULT 'local' COMMENT 'local/minio',
    bucket VARCHAR(128) DEFAULT NULL COMMENT 'storage bucket',
    object_key VARCHAR(512) NOT NULL COMMENT 'final object key',
    status VARCHAR(32) NOT NULL COMMENT 'UPLOADING/COMPLETED/ABORTED',
    file_id BIGINT DEFAULT NULL COMMENT 'completed file id',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
    expires_at DATETIME NOT NULL COMMENT 'unfinished upload expiry',
    UNIQUE KEY uk_upload_id (upload_id),
    INDEX idx_uploader_status (uploader_id, status),
    INDEX idx_expires_status (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='chunked file uploads';

CREATE TABLE IF NOT EXISTS im_file_upload_part (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT 'upload part row id',
    upload_id VARCHAR(64) NOT NULL COMMENT 'upload id',
    part_number INT NOT NULL COMMENT '1-based part number',
    part_size BIGINT NOT NULL COMMENT 'part size bytes',
    object_key VARCHAR(512) NOT NULL COMMENT 'part object key',
    etag VARCHAR(128) DEFAULT NULL COMMENT 'storage etag',
    status VARCHAR(32) NOT NULL COMMENT 'UPLOADED',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
    UNIQUE KEY uk_upload_part (upload_id, part_number),
    INDEX idx_upload_id (upload_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='chunked file upload parts';

CREATE TABLE IF NOT EXISTS im_user_settings (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT 'settings id',
    user_id BIGINT NOT NULL COMMENT 'user id',
    general_settings JSON NOT NULL COMMENT 'general settings',
    notification_settings JSON NOT NULL COMMENT 'notification settings',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated time',
    UNIQUE KEY uk_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='user settings';

INSERT INTO sys_dept (name, parent_id, sort_order, status) VALUES
('Head Office', 0, 0, 1);

-- Default admin account: admin / admin123
INSERT INTO sys_user (username, password, nickname, role, status) VALUES
('admin', '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iKTVKIUi', 'System Admin', 'admin', 1);
