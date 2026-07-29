package com.im.server.config;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class DatabaseMigrationResourceTest {

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
}
