package com.im.server.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.common.entity.SysUser;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SysUserSerializationTest {

    @Test
    void passwordHashIsNeverSerialized() throws Exception {
        SysUser user = new SysUser();
        user.setId(1L);
        user.setUsername("admin");
        user.setPassword("$2a$10$hash");

        String json = new ObjectMapper().writeValueAsString(user);

        assertThat(json).doesNotContain("password", "$2a$10$hash");
    }
}
