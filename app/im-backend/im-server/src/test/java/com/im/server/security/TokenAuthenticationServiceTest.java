package com.im.server.security;

import com.im.common.entity.SysUser;
import com.im.common.exception.BusinessException;
import com.im.common.util.JwtUtil;
import com.im.server.mapper.UserMapper;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TokenAuthenticationServiceTest {

    private final JwtUtil jwtUtil = mock(JwtUtil.class);
    private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    private final UserMapper userMapper = mock(UserMapper.class);
    private final TokenAuthenticationService service =
            new TokenAuthenticationService(jwtUtil, redisTemplate, userMapper);

    @Test
    void authorityComesFromCurrentUserRecord() {
        SysUser user = activeUser(7L, "admin", 3);
        when(jwtUtil.validateToken("token")).thenReturn(true);
        when(jwtUtil.getUserIdFromToken("token")).thenReturn(7L);
        when(jwtUtil.getTokenVersionFromToken("token")).thenReturn(3);
        when(redisTemplate.hasKey(service.revocationKey("token"))).thenReturn(false);
        when(userMapper.selectById(7L)).thenReturn(user);

        AuthenticatedUser authenticated = service.authenticate("token");

        assertThat(authenticated.role()).isEqualTo("admin");
        assertThat(authenticated.tokenVersion()).isEqualTo(3);
    }

    @Test
    void tokenVersionChangeRevokesExistingToken() {
        SysUser user = activeUser(7L, "user", 4);
        when(jwtUtil.validateToken("token")).thenReturn(true);
        when(jwtUtil.getUserIdFromToken("token")).thenReturn(7L);
        when(jwtUtil.getTokenVersionFromToken("token")).thenReturn(3);
        when(userMapper.selectById(7L)).thenReturn(user);

        assertThatThrownBy(() -> service.authenticate("token"))
                .isInstanceOf(BusinessException.class)
                .extracting("code")
                .isEqualTo(401);
    }

    @Test
    void disabledUserCannotAuthenticate() {
        SysUser user = activeUser(7L, "user", 3);
        user.setStatus(0);
        when(jwtUtil.validateToken("token")).thenReturn(true);
        when(jwtUtil.getUserIdFromToken("token")).thenReturn(7L);
        when(jwtUtil.getTokenVersionFromToken("token")).thenReturn(3);
        when(userMapper.selectById(7L)).thenReturn(user);

        assertThatThrownBy(() -> service.authenticate("token"))
                .isInstanceOf(BusinessException.class);
    }

    private SysUser activeUser(Long id, String role, int tokenVersion) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setUsername("user");
        user.setRole(role);
        user.setStatus(1);
        user.setTokenVersion(tokenVersion);
        return user;
    }
}
