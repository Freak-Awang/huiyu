-- MySQL rejects dropping and re-adding a same-named foreign key in a single
-- ALTER TABLE (error 1826), so the DROP and ADD are separate statements here.
ALTER TABLE im_file
    DROP FOREIGN KEY fk_file_conversation;

ALTER TABLE im_file
    ADD CONSTRAINT fk_file_conversation
        FOREIGN KEY (conversation_id) REFERENCES im_conversation(id)
        ON UPDATE RESTRICT ON DELETE SET NULL;

ALTER TABLE im_file_upload
    DROP FOREIGN KEY fk_upload_conversation;

ALTER TABLE im_file_upload
    ADD CONSTRAINT fk_upload_conversation
        FOREIGN KEY (conversation_id) REFERENCES im_conversation(id)
        ON UPDATE RESTRICT ON DELETE CASCADE;
