CREATE INDEX idx_user_avatar ON sys_user (avatar);
CREATE INDEX idx_file_uploader_status ON im_file (uploader_id, status);
