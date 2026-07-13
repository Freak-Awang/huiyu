# 数据库迁移

文件传输可用版发布前：

1. 备份现有数据库。
2. 在目标 `im_db` 上执行 `20260713_file_transfer_mvp_compat.sql`。
3. 检查 `im_file_upload`、`im_file_upload_part` 已存在，且 `im_file.object_key` 无空值。
4. 依次发布后端和前端。

该兼容迁移可重复执行，并保留旧 `im_file_transfer` 表及字段。不要在本次发布中执行会删除旧传输数据的 `20260606_remove_file_transfer.sql`；旧结构待新链路稳定后另行清理。
