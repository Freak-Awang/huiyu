-- Idempotent compatibility migration for the file-transfer MVP.
-- This migration is additive and deliberately keeps legacy im_file_transfer data.

DELIMITER $$

DROP PROCEDURE IF EXISTS add_column_if_missing$$
CREATE PROCEDURE add_column_if_missing(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_ddl TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column
  ) THEN
    SET @migration_ddl = p_ddl;
    PREPARE migration_stmt FROM @migration_ddl;
    EXECUTE migration_stmt;
    DEALLOCATE PREPARE migration_stmt;
  END IF;
END$$

DROP PROCEDURE IF EXISTS add_index_if_missing$$
CREATE PROCEDURE add_index_if_missing(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64),
  IN p_ddl TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_index
  ) THEN
    SET @migration_ddl = p_ddl;
    PREPARE migration_stmt FROM @migration_ddl;
    EXECUTE migration_stmt;
    DEALLOCATE PREPARE migration_stmt;
  END IF;
END$$

DELIMITER ;

CALL add_column_if_missing('im_file', 'conversation_id',
  'ALTER TABLE im_file ADD COLUMN conversation_id BIGINT NULL COMMENT ''conversation id'' AFTER uploader_id');
CALL add_column_if_missing('im_file', 'sha256',
  'ALTER TABLE im_file ADD COLUMN sha256 VARCHAR(64) NULL COMMENT ''file sha256'' AFTER conversation_id');
CALL add_column_if_missing('im_file', 'storage_type',
  'ALTER TABLE im_file ADD COLUMN storage_type VARCHAR(32) NOT NULL DEFAULT ''local'' COMMENT ''local/minio'' AFTER sha256');
CALL add_column_if_missing('im_file', 'bucket',
  'ALTER TABLE im_file ADD COLUMN bucket VARCHAR(128) NULL COMMENT ''storage bucket'' AFTER storage_type');
CALL add_column_if_missing('im_file', 'object_key',
  'ALTER TABLE im_file ADD COLUMN object_key VARCHAR(512) NULL COMMENT ''storage object key'' AFTER bucket');
CALL add_column_if_missing('im_file', 'status',
  'ALTER TABLE im_file ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT ''AVAILABLE'' COMMENT ''AVAILABLE/EXPIRED/BLOCKED'' AFTER object_key');
CALL add_column_if_missing('im_file', 'download_count',
  'ALTER TABLE im_file ADD COLUMN download_count INT NOT NULL DEFAULT 0 COMMENT ''download count'' AFTER status');
CALL add_column_if_missing('im_file', 'expires_at',
  'ALTER TABLE im_file ADD COLUMN expires_at DATETIME NULL COMMENT ''temporary file expiry'' AFTER create_time');
CALL add_column_if_missing('im_file', 'temporary',
  'ALTER TABLE im_file ADD COLUMN temporary TINYINT NOT NULL DEFAULT 1 COMMENT ''0=persistent, 1=temporary'' AFTER expires_at');

CALL add_index_if_missing('im_file', 'idx_conversation_id',
  'ALTER TABLE im_file ADD INDEX idx_conversation_id (conversation_id)');
CALL add_index_if_missing('im_file', 'idx_sha256',
  'ALTER TABLE im_file ADD INDEX idx_sha256 (sha256)');
CALL add_index_if_missing('im_file', 'idx_status_expires',
  'ALTER TABLE im_file ADD INDEX idx_status_expires (status, expires_at)');
CALL add_index_if_missing('im_file', 'idx_expires_temporary',
  'ALTER TABLE im_file ADD INDEX idx_expires_temporary (temporary, expires_at)');

UPDATE im_file
SET storage_type = COALESCE(NULLIF(storage_type, ''), 'local'),
    object_key = file_path,
    status = COALESCE(NULLIF(status, ''), 'AVAILABLE'),
    download_count = COALESCE(download_count, 0)
WHERE object_key IS NULL OR object_key = '';

CREATE TABLE IF NOT EXISTS im_file_upload (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  upload_id VARCHAR(64) NOT NULL,
  uploader_id BIGINT NOT NULL,
  conversation_id BIGINT NOT NULL,
  file_name VARCHAR(256) NOT NULL,
  file_size BIGINT NOT NULL,
  content_type VARCHAR(128) DEFAULT NULL,
  sha256 VARCHAR(64) DEFAULT NULL,
  chunk_size BIGINT NOT NULL,
  total_parts INT NOT NULL,
  storage_type VARCHAR(32) NOT NULL DEFAULT 'local',
  bucket VARCHAR(128) DEFAULT NULL,
  object_key VARCHAR(512) NOT NULL,
  status VARCHAR(32) NOT NULL,
  file_id BIGINT DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  UNIQUE KEY uk_upload_id (upload_id),
  INDEX idx_uploader_status (uploader_id, status),
  INDEX idx_expires_status (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS im_file_upload_part (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  upload_id VARCHAR(64) NOT NULL,
  part_number INT NOT NULL,
  part_size BIGINT NOT NULL,
  object_key VARCHAR(512) NOT NULL,
  etag VARCHAR(128) DEFAULT NULL,
  status VARCHAR(32) NOT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_upload_part (upload_id, part_number),
  INDEX idx_upload_id (upload_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS add_column_if_missing;
DROP PROCEDURE IF EXISTS add_index_if_missing;
