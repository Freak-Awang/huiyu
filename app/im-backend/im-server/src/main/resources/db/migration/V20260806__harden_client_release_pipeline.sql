-- Guarded DDL supports both the historical Flyway baseline and a schema.sql initialized database.
SET @add_source_commit_sql := (
    SELECT IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'im_client_release' AND COLUMN_NAME = 'source_commit'),
              'SELECT 1', 'ALTER TABLE im_client_release ADD COLUMN source_commit CHAR(40) NULL AFTER installer_sha512')
);
PREPARE add_source_commit_stmt FROM @add_source_commit_sql;
EXECUTE add_source_commit_stmt;
DEALLOCATE PREPARE add_source_commit_stmt;

SET @add_manifest_name_sql := (
    SELECT IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'im_client_release' AND COLUMN_NAME = 'manifest_name'),
              'SELECT 1', 'ALTER TABLE im_client_release ADD COLUMN manifest_name VARCHAR(64) NULL AFTER source_commit')
);
PREPARE add_manifest_name_stmt FROM @add_manifest_name_sql;
EXECUTE add_manifest_name_stmt;
DEALLOCATE PREPARE add_manifest_name_stmt;

SET @add_manifest_digest_sql := (
    SELECT IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'im_client_release' AND COLUMN_NAME = 'manifest_digest'),
              'SELECT 1', 'ALTER TABLE im_client_release ADD COLUMN manifest_digest CHAR(64) NULL AFTER manifest_name')
);
PREPARE add_manifest_digest_stmt FROM @add_manifest_digest_sql;
EXECUTE add_manifest_digest_stmt;
DEALLOCATE PREPARE add_manifest_digest_stmt;

SET @add_signer_thumbprint_sql := (
    SELECT IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'im_client_release' AND COLUMN_NAME = 'signer_thumbprint'),
              'SELECT 1', 'ALTER TABLE im_client_release ADD COLUMN signer_thumbprint VARCHAR(64) NULL AFTER manifest_digest')
);
PREPARE add_signer_thumbprint_stmt FROM @add_signer_thumbprint_sql;
EXECUTE add_signer_thumbprint_stmt;
DEALLOCATE PREPARE add_signer_thumbprint_stmt;

SET @add_artifact_verified_at_sql := (
    SELECT IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'im_client_release' AND COLUMN_NAME = 'artifact_verified_at'),
              'SELECT 1', 'ALTER TABLE im_client_release ADD COLUMN artifact_verified_at DATETIME NULL AFTER signer_thumbprint')
);
PREPARE add_artifact_verified_at_stmt FROM @add_artifact_verified_at_sql;
EXECUTE add_artifact_verified_at_stmt;
DEALLOCATE PREPARE add_artifact_verified_at_stmt;

SET @add_release_id_sql := (
    SELECT IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'im_client_update_event' AND COLUMN_NAME = 'release_id'),
              'SELECT 1', 'ALTER TABLE im_client_update_event ADD COLUMN release_id BIGINT NULL AFTER user_id')
);
PREPARE add_release_id_stmt FROM @add_release_id_sql;
EXECUTE add_release_id_stmt;
DEALLOCATE PREPARE add_release_id_stmt;

SET @add_release_id_index_sql := (
    SELECT IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'im_client_update_event' AND INDEX_NAME = 'idx_update_release_id_stats'),
              'SELECT 1', 'ALTER TABLE im_client_update_event ADD INDEX idx_update_release_id_stats (release_id, event_type, device_id)')
);
PREPARE add_release_id_index_stmt FROM @add_release_id_index_sql;
EXECUTE add_release_id_index_stmt;
DEALLOCATE PREPARE add_release_id_index_stmt;

CREATE TABLE IF NOT EXISTS im_client_release_audit (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    release_id BIGINT NOT NULL,
    action VARCHAR(48) NOT NULL,
    reason VARCHAR(500) NULL,
    operator_id BIGINT NULL,
    details VARCHAR(2000) NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_release_audit (release_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='append-only desktop release audit evidence';
