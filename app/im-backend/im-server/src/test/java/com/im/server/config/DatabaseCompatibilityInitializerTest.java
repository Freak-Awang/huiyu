package com.im.server.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentMatcher;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.ApplicationArguments;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class DatabaseCompatibilityInitializerTest {

    @Mock
    private JdbcTemplate jdbcTemplate;

    @Test
    void createsUserSettingsTableOnStartup() {
        DatabaseCompatibilityInitializer initializer = new DatabaseCompatibilityInitializer(jdbcTemplate);

        initializer.run(mock(ApplicationArguments.class));

        verify(jdbcTemplate).execute(argThat(userSettingsTableDdl()));
    }

    @Test
    void failsFastWhenCompatibilitySchemaCannotBeCreated() {
        doThrow(new DataAccessResourceFailureException("database unavailable"))
                .when(jdbcTemplate)
                .execute(argThat(userSettingsTableDdl()));
        DatabaseCompatibilityInitializer initializer = new DatabaseCompatibilityInitializer(jdbcTemplate);

        assertThatThrownBy(() -> initializer.run(mock(ApplicationArguments.class)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Failed to initialize database compatibility schema")
                .hasCauseInstanceOf(DataAccessResourceFailureException.class);
    }

    private ArgumentMatcher<String> userSettingsTableDdl() {
        return sql -> sql != null
                && sql.contains("CREATE TABLE IF NOT EXISTS im_user_settings")
                && sql.contains("general_settings JSON NOT NULL")
                && sql.contains("notification_settings JSON NOT NULL")
                && sql.contains("UNIQUE KEY uk_user_id (user_id)");
    }
}
