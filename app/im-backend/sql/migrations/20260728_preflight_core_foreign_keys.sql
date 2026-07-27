-- Run before V20260728. Every result must be zero before deployment.
SELECT 'orphan_member_conversation' AS check_name, COUNT(*) AS orphan_count
FROM im_conversation_member m LEFT JOIN im_conversation c ON c.id = m.conversation_id
WHERE c.id IS NULL
UNION ALL
SELECT 'orphan_user_department', COUNT(*)
FROM sys_user u LEFT JOIN sys_dept d ON d.id = u.dept_id
WHERE u.dept_id IS NOT NULL AND d.id IS NULL
UNION ALL
SELECT 'orphan_conversation_owner', COUNT(*)
FROM im_conversation c LEFT JOIN sys_user u ON u.id = c.owner_id
WHERE c.owner_id IS NOT NULL AND u.id IS NULL
UNION ALL
SELECT 'orphan_member_user', COUNT(*)
FROM im_conversation_member m LEFT JOIN sys_user u ON u.id = m.user_id
WHERE u.id IS NULL
UNION ALL
SELECT 'orphan_message_conversation', COUNT(*)
FROM im_message m LEFT JOIN im_conversation c ON c.id = m.conversation_id
WHERE c.id IS NULL
UNION ALL
SELECT 'orphan_message_sender', COUNT(*)
FROM im_message m LEFT JOIN sys_user u ON u.id = m.sender_id
WHERE u.id IS NULL
UNION ALL
SELECT 'orphan_delivery_message', COUNT(*)
FROM im_message_delivery d LEFT JOIN im_message m ON m.id = d.message_id
WHERE m.id IS NULL
UNION ALL
SELECT 'orphan_delivery_conversation', COUNT(*)
FROM im_message_delivery d LEFT JOIN im_conversation c ON c.id = d.conversation_id
WHERE c.id IS NULL
UNION ALL
SELECT 'orphan_delivery_user', COUNT(*)
FROM im_message_delivery d LEFT JOIN sys_user u ON u.id = d.user_id
WHERE u.id IS NULL
UNION ALL
SELECT 'orphan_file_uploader', COUNT(*)
FROM im_file f LEFT JOIN sys_user u ON u.id = f.uploader_id
WHERE u.id IS NULL
UNION ALL
SELECT 'orphan_file_conversation', COUNT(*)
FROM im_file f LEFT JOIN im_conversation c ON c.id = f.conversation_id
WHERE f.conversation_id IS NOT NULL AND c.id IS NULL
UNION ALL
SELECT 'orphan_upload_uploader', COUNT(*)
FROM im_file_upload f LEFT JOIN sys_user u ON u.id = f.uploader_id
WHERE u.id IS NULL
UNION ALL
SELECT 'orphan_upload_conversation', COUNT(*)
FROM im_file_upload f LEFT JOIN im_conversation c ON c.id = f.conversation_id
WHERE c.id IS NULL
UNION ALL
SELECT 'orphan_upload_file', COUNT(*)
FROM im_file_upload f LEFT JOIN im_file stored ON stored.id = f.file_id
WHERE f.file_id IS NOT NULL AND stored.id IS NULL
UNION ALL
SELECT 'orphan_upload_part', COUNT(*)
FROM im_file_upload_part p LEFT JOIN im_file_upload f ON f.upload_id = p.upload_id
WHERE f.upload_id IS NULL
UNION ALL
SELECT 'orphan_user_settings', COUNT(*)
FROM im_user_settings s LEFT JOIN sys_user u ON u.id = s.user_id
WHERE u.id IS NULL
UNION ALL
SELECT 'orphan_release_creator', COUNT(*)
FROM im_client_release r LEFT JOIN sys_user u ON u.id = r.created_by
WHERE r.created_by IS NOT NULL AND u.id IS NULL
UNION ALL
SELECT 'orphan_release_target', COUNT(*)
FROM im_client_release_target t LEFT JOIN im_client_release r ON r.id = t.release_id
WHERE r.id IS NULL
UNION ALL
SELECT 'orphan_update_event_user', COUNT(*)
FROM im_client_update_event e LEFT JOIN sys_user u ON u.id = e.user_id
WHERE e.user_id IS NOT NULL AND u.id IS NULL
UNION ALL
SELECT 'insecure_published_update_url', COUNT(*)
FROM im_client_release
WHERE status = 'PUBLISHED'
  AND update_base_url NOT LIKE 'https://%'
  AND update_base_url NOT LIKE 'http://localhost%'
  AND update_base_url NOT LIKE 'http://127.0.0.1%';
