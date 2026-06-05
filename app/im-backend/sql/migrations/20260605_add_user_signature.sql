ALTER TABLE sys_user
    ADD COLUMN signature VARCHAR(128) DEFAULT NULL COMMENT 'personal signature' AFTER avatar;
