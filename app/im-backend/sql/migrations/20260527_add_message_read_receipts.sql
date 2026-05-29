-- Adds per-recipient read receipts for message-level read/unread state.
-- This script is safe to run more than once against existing deployments.

SET @column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'im_message_delivery'
    AND COLUMN_NAME = 'read_status'
);

SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE im_message_delivery ADD COLUMN read_status TINYINT NOT NULL DEFAULT 0 COMMENT ''0=unread, 1=read'' AFTER delivered_time',
  'SELECT ''im_message_delivery.read_status already exists'' AS message'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'im_message_delivery'
    AND COLUMN_NAME = 'read_time'
);

SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE im_message_delivery ADD COLUMN read_time DATETIME DEFAULT NULL COMMENT ''read time'' AFTER read_status',
  'SELECT ''im_message_delivery.read_time already exists'' AS message'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'im_message_delivery'
    AND INDEX_NAME = 'idx_conv_user_read'
);

SET @ddl := IF(
  @index_exists = 0,
  'ALTER TABLE im_message_delivery ADD INDEX idx_conv_user_read (conversation_id, user_id, read_status)',
  'SELECT ''im_message_delivery.idx_conv_user_read already exists'' AS message'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE im_message_delivery d
JOIN im_message m ON m.id = d.message_id
SET d.read_status = 1,
    d.read_time = COALESCE(d.delivered_time, m.create_time, d.create_time)
WHERE d.user_id = m.sender_id
  AND d.read_status = 0;
