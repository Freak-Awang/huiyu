package com.im.server.security;

import com.im.common.util.JwtUtil;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtSecretValidationTest {

    @Test
    void knownDefaultSecretIsRejected() {
        JwtUtil jwtUtil = new JwtUtil();
        ReflectionTestUtils.setField(
                jwtUtil,
                "secret",
                "im-secret-key-needs-changing-in-production-2024!");

        assertThatThrownBy(() -> ReflectionTestUtils.invokeMethod(jwtUtil, "validateSecret"))
                .isInstanceOf(IllegalStateException.class);
    }
}
