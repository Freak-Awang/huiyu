package com.im.server.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.common.entity.SysUser;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SysUser 序列化安全测试，验证密码哈希不会被序列化到 JSON 中，防止敏感信息泄露。
 */
class SysUserSerializationTest {

    /**
     * 验证 SysUser 对象序列化为 JSON 后不包含 password 字段和哈希值，
     * 确保 @JsonIgnore 注解生效。
     */
    @Test
    void passwordHashIsNeverSerialized() throws Exception {
        SysUser user = new SysUser();
        user.setId(1L);
        user.setUsername("admin");
        user.setPassword("$2a$10$hash"); // 应被 @JsonIgnore 忽略

        String json = new ObjectMapper().writeValueAsString(user);

        assertThat(json).doesNotContain("password", "$2a$10$hash");
    }
}
