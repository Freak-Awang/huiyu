ALTER TABLE im_file
  ADD COLUMN conversation_id BIGINT DEFAULT NULL COMMENT 'conversation id' AFTER uploader_id,
  ADD COLUMN sha256 VARCHAR(64) DEFAULT NULL COMMENT 'file sha256' AFTER conversation_id,
  ADD COLUMN storage_type VARCHAR(32) NOT NULL DEFAULT 'local' COMMENT 'local/minio' AFTER sha256,
  ADD COLUMN bucket VARCHAR(128) DEFAULT NULL COMMENT 'storage bucket' AFTER storage_type,
  ADD COLUMN object_key VARCHAR(512) DEFAULT NULL COMMENT 'storage object key' AFTER bucket,
  ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE' COMMENT 'AVAILABLE/EXPIRED/BLOCKED' AFTER object_key,
  ADD COLUMN download_count INT NOT NULL DEFAULT 0 COMMENT 'download count' AFTER status,
  ADD INDEX idx_conversation_id (conversation_id),
  ADD INDEX idx_sha256 (sha256),
  ADD INDEX idx_status_expires (status, expires_at);

UPDATE im_file
SET storage_type = 'local',
    object_key = file_path,
    status = 'AVAILABLE',
    download_count = 0
WHERE object_key IS NULL;

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
