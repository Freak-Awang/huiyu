ALTER TABLE im_conversation
    ADD COLUMN avatar_type VARCHAR(16) NULL COMMENT 'group avatar type: default/custom' AFTER avatar,
    ADD COLUMN avatar_updated_by BIGINT NULL COMMENT 'last group avatar updater user id' AFTER avatar_type,
    ADD COLUMN avatar_updated_at DATETIME NULL COMMENT 'last group avatar update time' AFTER avatar_updated_by;

UPDATE im_conversation
SET avatar_type = CASE
    WHEN avatar IS NULL OR TRIM(avatar) = '' THEN 'default'
    ELSE 'custom'
END
WHERE type = 2;
