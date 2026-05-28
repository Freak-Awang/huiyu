-- Adds per-recipient read receipts for message-level read/unread state.

ALTER TABLE im_message_delivery
  ADD COLUMN read_status TINYINT NOT NULL DEFAULT 0 COMMENT '0=unread, 1=read' AFTER delivered_time,
  ADD COLUMN read_time DATETIME DEFAULT NULL COMMENT 'read time' AFTER read_status,
  ADD INDEX idx_conv_user_read (conversation_id, user_id, read_status);

UPDATE im_message_delivery d
JOIN im_message m ON m.id = d.message_id
SET d.read_status = 1,
    d.read_time = COALESCE(d.delivered_time, m.create_time, d.create_time)
WHERE d.user_id = m.sender_id;
