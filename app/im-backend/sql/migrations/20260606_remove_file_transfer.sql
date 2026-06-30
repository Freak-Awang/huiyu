DROP TABLE IF EXISTS im_file_transfer;

SET @drop_upload_transfer_id := (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'im_file_upload'
        AND COLUMN_NAME = 'transfer_id'
    ),
    'ALTER TABLE im_file_upload DROP COLUMN transfer_id',
    'SELECT 1'
  )
);

PREPARE drop_upload_transfer_id_stmt FROM @drop_upload_transfer_id;
EXECUTE drop_upload_transfer_id_stmt;
DEALLOCATE PREPARE drop_upload_transfer_id_stmt;
