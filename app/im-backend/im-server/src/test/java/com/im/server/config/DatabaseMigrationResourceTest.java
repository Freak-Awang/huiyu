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
}
