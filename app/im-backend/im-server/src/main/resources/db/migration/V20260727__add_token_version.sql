SET @add_token_version_sql := (
    SELECT IF(
        EXISTS (
            SELECT 1
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'sys_user'
              AND COLUMN_NAME = 'token_version'
        ),
        'SELECT 1',
        'ALTER TABLE sys_user ADD COLUMN token_version INT NOT NULL DEFAULT 0 COMMENT ''incremented to revoke issued tokens'' AFTER status'
    )
);

PREPARE add_token_version_stmt FROM @add_token_version_sql;
EXECUTE add_token_version_stmt;
DEALLOCATE PREPARE add_token_version_stmt;
