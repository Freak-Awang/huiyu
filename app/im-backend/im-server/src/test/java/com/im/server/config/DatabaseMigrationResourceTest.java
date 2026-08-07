package com.im.server.config;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 数据库迁移 SQL 资源测试，验证 Flyway 迁移脚本的 classpath 可用性和关键内容。
 *
 * <p>测试范围：token_version 字段添加迁移、群头像状态迁移。</p>
 */
class DatabaseMigrationResourceTest {

    /**
     * 验证 token_version 迁移 SQL 存在且包含必要 DDL：information_schema.COLUMNS 检测、
     * token_version 字段添加、PREPARE 动态 SQL。
     */
    @Test
    void tokenVersionMigrationIsVersionedAndRepeatSafe() throws Exception {
        try (var input = getClass().getResourceAsStream(
                "/db/migration/V20260727__add_token_version.sql")) {
            assertThat(input).isNotNull();
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            assertThat(sql).contains("information_schema.COLUMNS");
            assertThat(sql).contains("token_version");
            assertThat(sql).contains("PREPARE add_token_version_stmt");
        }
    }

    /**
     * 验证群头像状态迁移 SQL 存在，包含 avatar_type/avatar_updated_by/avatar_updated_at 字段添加
     * 和已有群聊头像类型的回填逻辑（type=2 且无自定义头像→default，有→custom）。
     */
    @Test
    void groupAvatarMigrationAddsStateAndBackfillsExistingGroups() throws Exception {
        try (var input = getClass().getResourceAsStream(
                "/db/migration/V20260730__add_group_avatar_state.sql")) {
            assertThat(input).isNotNull();
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            assertThat(sql).contains("avatar_type");
            assertThat(sql).contains("avatar_updated_by");
            assertThat(sql).contains("avatar_updated_at");
            assertThat(sql).contains("WHERE type = 2");
            assertThat(sql).contains("THEN 'default'");
            assertThat(sql).contains("ELSE 'custom'");
        }
    }

    @Test
    void releasePipelineMigrationSupportsBothDatabaseBaselines() throws Exception {
        try (var input = getClass().getResourceAsStream(
                "/db/migration/V20260806__harden_client_release_pipeline.sql")) {
            assertThat(input).isNotNull();
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            assertThat(sql).contains("information_schema.COLUMNS");
            assertThat(sql).contains("source_commit");
            assertThat(sql).contains("manifest_digest");
            assertThat(sql).contains("release_id");
            assertThat(sql).contains("im_client_release_audit");
        }
    }
}
