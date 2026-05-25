-- Adds the conversation mute flag required by the current backend entity.
-- Run this once against existing trial databases that were initialized before
-- im_conversation_member.is_muted was added to schema.sql.

SET @column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'im_conversation_member'
    AND COLUMN_NAME = 'is_muted'
);

SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE im_conversation_member ADD COLUMN is_muted TINYINT NOT NULL DEFAULT 0 COMMENT ''是否免打扰: 0=否, 1=是'' AFTER is_pinned',
  'SELECT ''im_conversation_member.is_muted already exists'' AS message'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
