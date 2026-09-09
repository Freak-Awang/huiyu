-- Control metadata only. No file content, filesystem paths, manifests or offsets.
CREATE TABLE IF NOT EXISTS im_p2p_share (
    transfer_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    message_id BIGINT NOT NULL,
    state VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    revision BIGINT NOT NULL DEFAULT 1,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_p2p_share_message (message_id),
    CONSTRAINT fk_p2p_share_message FOREIGN KEY (message_id) REFERENCES im_message(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Restore authorization for unique valid legacy summaries, never an online source.
INSERT INTO im_p2p_share (transfer_id, message_id, state, revision)
SELECT transfer_id, MIN(id), 'ACTIVE', 1
FROM (
    SELECT id,
           JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(content), content, '{}'), '$.transferId')) AS transfer_id
    FROM im_message
    WHERE status <> 'RECALLED' AND message_type IN ('FILE', 'FOLDER')
      AND JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(content), content, '{}'), '$.transferMode')) = 'p2p_lan'
      AND JSON_EXTRACT(IF(JSON_VALID(content), content, '{}'), '$.version') = 1
      AND JSON_EXTRACT(IF(JSON_VALID(content), content, '{}'), '$.totalSize') > 0
      AND JSON_EXTRACT(IF(JSON_VALID(content), content, '{}'), '$.fileCount') > 0
      AND JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(content), content, '{}'),
          IF(message_type = 'FILE', '$.sha256', '$.manifestSha256'))) REGEXP '^[0-9A-Fa-f]{64}$'
) legacy
WHERE transfer_id REGEXP '^p2p_[A-Za-z0-9_-]{1,60}$'
GROUP BY transfer_id HAVING COUNT(*) = 1;
