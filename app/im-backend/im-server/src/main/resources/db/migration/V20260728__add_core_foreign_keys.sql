ALTER TABLE sys_user
    ADD CONSTRAINT fk_user_department
    FOREIGN KEY (dept_id) REFERENCES sys_dept(id)
    ON UPDATE RESTRICT ON DELETE SET NULL;

ALTER TABLE im_conversation
    ADD CONSTRAINT fk_conversation_owner
    FOREIGN KEY (owner_id) REFERENCES sys_user(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE im_conversation_member
    ADD CONSTRAINT fk_member_conversation
        FOREIGN KEY (conversation_id) REFERENCES im_conversation(id)
        ON UPDATE RESTRICT ON DELETE CASCADE,
    ADD CONSTRAINT fk_member_user
        FOREIGN KEY (user_id) REFERENCES sys_user(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE im_message
    ADD CONSTRAINT fk_message_conversation
        FOREIGN KEY (conversation_id) REFERENCES im_conversation(id)
        ON UPDATE RESTRICT ON DELETE CASCADE,
    ADD CONSTRAINT fk_message_sender
        FOREIGN KEY (sender_id) REFERENCES sys_user(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE im_message_delivery
    ADD CONSTRAINT fk_delivery_message
        FOREIGN KEY (message_id) REFERENCES im_message(id)
        ON UPDATE RESTRICT ON DELETE CASCADE,
    ADD CONSTRAINT fk_delivery_conversation
        FOREIGN KEY (conversation_id) REFERENCES im_conversation(id)
        ON UPDATE RESTRICT ON DELETE CASCADE,
    ADD CONSTRAINT fk_delivery_user
        FOREIGN KEY (user_id) REFERENCES sys_user(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE im_file
    ADD CONSTRAINT fk_file_uploader
        FOREIGN KEY (uploader_id) REFERENCES sys_user(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    ADD CONSTRAINT fk_file_conversation
        FOREIGN KEY (conversation_id) REFERENCES im_conversation(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE im_file_upload
    ADD CONSTRAINT fk_upload_uploader
        FOREIGN KEY (uploader_id) REFERENCES sys_user(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    ADD CONSTRAINT fk_upload_conversation
        FOREIGN KEY (conversation_id) REFERENCES im_conversation(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    ADD CONSTRAINT fk_upload_file
        FOREIGN KEY (file_id) REFERENCES im_file(id)
        ON UPDATE RESTRICT ON DELETE SET NULL;

ALTER TABLE im_file_upload_part
    ADD CONSTRAINT fk_upload_part_upload
    FOREIGN KEY (upload_id) REFERENCES im_file_upload(upload_id)
    ON UPDATE RESTRICT ON DELETE CASCADE;

ALTER TABLE im_user_settings
    ADD CONSTRAINT fk_settings_user
    FOREIGN KEY (user_id) REFERENCES sys_user(id)
    ON UPDATE RESTRICT ON DELETE CASCADE;

ALTER TABLE im_client_release
    ADD CONSTRAINT fk_release_creator
    FOREIGN KEY (created_by) REFERENCES sys_user(id)
    ON UPDATE RESTRICT ON DELETE SET NULL;

ALTER TABLE im_client_release_target
    ADD CONSTRAINT fk_release_target_release
    FOREIGN KEY (release_id) REFERENCES im_client_release(id)
    ON UPDATE RESTRICT ON DELETE CASCADE;

ALTER TABLE im_client_update_event
    ADD CONSTRAINT fk_update_event_user
    FOREIGN KEY (user_id) REFERENCES sys_user(id)
    ON UPDATE RESTRICT ON DELETE SET NULL;
