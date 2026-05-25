-- Adds 7-day server retention support for desktop-local chat history.
-- Existing messages are marked as expiring 7 days after this migration.

ALTER TABLE im_message
  ADD COLUMN expires_at DATETIME NULL COMMENT 'server-side retention expiry' AFTER create_time,
  ADD INDEX idx_expires_at (expires_at);

UPDATE im_message
SET expires_at = DATE_ADD(NOW(), INTERVAL 7 DAY)
WHERE expires_at IS NULL;

CREATE TABLE IF NOT EXISTS im_message_delivery (
  id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT 'delivery id',
  message_id BIGINT NOT NULL COMMENT 'message id',
  conversation_id BIGINT NOT NULL COMMENT 'conversation id',
  user_id BIGINT NOT NULL COMMENT 'recipient user id',
  delivered TINYINT NOT NULL DEFAULT 0 COMMENT '0=pending, 1=delivered',
  delivered_time DATETIME DEFAULT NULL COMMENT 'delivery ack time',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created time',
  UNIQUE KEY uk_msg_user (message_id, user_id),
  INDEX idx_user_delivered (user_id, delivered, create_time),
  INDEX idx_message_id (message_id),
  INDEX idx_conversation_id (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='message delivery state';

INSERT IGNORE INTO im_message_delivery (
  message_id,
  conversation_id,
  user_id,
  delivered,
  delivered_time,
  create_time
)
SELECT
  m.id,
  m.conversation_id,
  cm.user_id,
  CASE WHEN cm.user_id = m.sender_id THEN 1 ELSE 0 END,
  CASE WHEN cm.user_id = m.sender_id THEN m.create_time ELSE NULL END,
  m.create_time
FROM im_message m
JOIN im_conversation_member cm ON cm.conversation_id = m.conversation_id;

ALTER TABLE im_file
  ADD COLUMN expires_at DATETIME NULL COMMENT 'temporary file expiry' AFTER create_time,
  ADD COLUMN temporary TINYINT NOT NULL DEFAULT 1 COMMENT '0=persistent, 1=temporary' AFTER expires_at,
  ADD INDEX idx_expires_temporary (temporary, expires_at);

UPDATE im_file
SET expires_at = DATE_ADD(NOW(), INTERVAL 7 DAY),
    temporary = 1
WHERE expires_at IS NULL;
