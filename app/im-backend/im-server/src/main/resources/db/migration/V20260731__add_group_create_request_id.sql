ALTER TABLE im_conversation
    ADD COLUMN create_request_id VARCHAR(64) NULL
        COMMENT 'idempotency key for group creation' AFTER owner_id,
    ADD UNIQUE KEY uk_owner_create_request (owner_id, create_request_id);
