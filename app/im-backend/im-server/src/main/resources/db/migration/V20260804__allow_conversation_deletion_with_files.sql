ALTER TABLE im_file
    DROP FOREIGN KEY fk_file_conversation,
    ADD CONSTRAINT fk_file_conversation
        FOREIGN KEY (conversation_id) REFERENCES im_conversation(id)
        ON UPDATE RESTRICT ON DELETE SET NULL;

ALTER TABLE im_file_upload
    DROP FOREIGN KEY fk_upload_conversation,
    ADD CONSTRAINT fk_upload_conversation
        FOREIGN KEY (conversation_id) REFERENCES im_conversation(id)
        ON UPDATE RESTRICT ON DELETE CASCADE;
