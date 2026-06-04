ALTER TABLE im_conversation
  ADD COLUMN announcement TEXT NULL COMMENT 'group announcement' AFTER owner_id,
  ADD COLUMN announcement_updated_by BIGINT NULL COMMENT 'announcement updater user id' AFTER announcement,
  ADD COLUMN announcement_updated_at DATETIME NULL COMMENT 'announcement update time' AFTER announcement_updated_by;

UPDATE im_message
SET expires_at = NULL;

UPDATE im_file
SET temporary = 0,
    expires_at = NULL
WHERE conversation_id IS NOT NULL;
