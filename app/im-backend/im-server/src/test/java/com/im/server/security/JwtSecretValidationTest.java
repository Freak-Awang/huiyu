package com.im.server.security;

import com.im.common.util.JwtUtil;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * JWT 密钥安全校验测试，验证已知默认密钥会被拒绝，防止生产环境使用不安全密钥。
 */
class JwtSecretValidationTest {

    /**
     * 验证使用已知硬编码默认密钥时，validateSecret 抛出 IllegalStateException，
     * 确保生产部署必须更换密钥。
     */
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
