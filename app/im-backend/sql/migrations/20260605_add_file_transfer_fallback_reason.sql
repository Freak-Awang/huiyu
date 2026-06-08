ALTER TABLE im_file_transfer
  ADD COLUMN fallback_reason VARCHAR(256) DEFAULT NULL COMMENT 'server fallback reason' AFTER file_id;
