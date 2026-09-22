-- 只读账号诊断：在实际业务库执行。不输出密码明文、完整哈希或 Token。
-- SET 仅设置当前连接的查询参数，不修改表数据。
SET @diagnostic_username = 'zhangxiaoxia';

SELECT DATABASE() AS database_name, @@hostname AS database_host, VERSION() AS mysql_version;

SELECT id, username, HEX(username) AS username_hex,
       CHAR_LENGTH(username) AS username_characters,
       status, role, token_version, create_time, update_time,
       CHAR_LENGTH(password) AS password_hash_characters,
       CASE
           WHEN password IS NULL OR password = '' THEN 'EMPTY'
           WHEN REGEXP_LIKE(password, '^[$]2[ayb]?[$](0[4-9]|[12][0-9]|3[01])[$][./0-9A-Za-z]{53}$', 'c')
               THEN 'BCRYPT_FORMAT_VALID'
           ELSE 'INVALID_PASSWORD_HASH'
       END AS password_hash_format
FROM sys_user
WHERE username = @diagnostic_username OR TRIM(username) = @diagnostic_username;

-- 格式正确不代表密码匹配；此查询仅统计可能受相同数据问题影响的启用账号。
SELECT COUNT(*) AS enabled_accounts_with_invalid_hash
FROM sys_user
WHERE status = 1 AND (password IS NULL OR NOT REGEXP_LIKE(
    password, '^[$]2[ayb]?[$](0[4-9]|[12][0-9]|3[01])[$][./0-9A-Za-z]{53}$', 'c'));
