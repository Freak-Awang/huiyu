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

/**
 * Token 认证服务测试，验证 JWT 鉴权、token 版本吊销、用户禁用处理。
 *
 * <p>测试范围：TokenAuthenticationService.authenticate 的鉴权链路——
 * JWT 验证→Redis 吊销检查→用户状态校验→tokenVersion 匹配。</p>
 */
class TokenAuthenticationServiceTest {

    private final JwtUtil jwtUtil = mock(JwtUtil.class);
    private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    private final UserMapper userMapper = mock(UserMapper.class);
    private final TokenAuthenticationService service =
            new TokenAuthenticationService(jwtUtil, redisTemplate, userMapper);

    /**
     * 验证正常鉴权流程：JWT 有效、未吊销、用户存在且状态正常、tokenVersion 匹配，
     * 返回的 AuthenticatedUser 角色和 tokenVersion 与数据库一致。
     */
    @Test
    void authorityComesFromCurrentUserRecord() {
        SysUser user = activeUser(7L, "admin", 3);
        when(jwtUtil.validateToken("token")).thenReturn(true);
        when(jwtUtil.getUserIdFromToken("token")).thenReturn(7L);
        when(jwtUtil.getTokenVersionFromToken("token")).thenReturn(3);
        when(redisTemplate.hasKey(service.revocationKey("token"))).thenReturn(false); // 未吊销
        when(userMapper.selectById(7L)).thenReturn(user);

        AuthenticatedUser authenticated = service.authenticate("token");

        assertThat(authenticated.role()).isEqualTo("admin");
        assertThat(authenticated.tokenVersion()).isEqualTo(3);
    }

    /**
     * 验证 tokenVersion 变更后旧 token 被拒绝：JWT 中 version=3，数据库已更新为 4，
     * 应抛出 BusinessException(401)。
     */
    @Test
    void tokenVersionChangeRevokesExistingToken() {
        SysUser user = activeUser(7L, "user", 4); // 数据库 tokenVersion=4
        when(jwtUtil.validateToken("token")).thenReturn(true);
        when(jwtUtil.getUserIdFromToken("token")).thenReturn(7L);
        when(jwtUtil.getTokenVersionFromToken("token")).thenReturn(3); // JWT 中 version=3
        when(userMapper.selectById(7L)).thenReturn(user);

        assertThatThrownBy(() -> service.authenticate("token"))
                .isInstanceOf(BusinessException.class)
                .extracting("code")
                .isEqualTo(401);
    }

    /**
     * 验证已禁用用户（status=0）无法通过鉴权，抛出 BusinessException。
     */
    @Test
    void disabledUserCannotAuthenticate() {
        SysUser user = activeUser(7L, "user", 3);
        user.setStatus(0); // 禁用状态
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
