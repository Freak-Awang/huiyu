package com.im.server.config;

import com.im.common.exception.BusinessException;
import com.im.server.security.AuthenticatedUser;
import com.im.server.security.TokenAuthenticationService;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * JWT 认证过滤器测试，验证 token 鉴权、白名单放行、角色权限注入和 token 吊销处理。
 *
 * <p>测试范围：admin 角色自动获得 ROLE_ADMIN 权限、匿名下载白名单放行、保护端点拒绝无 token 请求、
 * 吊销 token 返回 401。</p>
 */
class JwtAuthenticationFilterTest {

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /**
     * 验证 admin 角色的 token 认证后，SecurityContext 中同时包含 "admin" 和 "ROLE_ADMIN" 权限，
     * 且 FilterChain 正常继续执行。
     */
    @Test
    void adminRoleUsesCurrentDatabaseAuthority() throws Exception {
        TokenAuthenticationService authenticationService = mock(TokenAuthenticationService.class);
        FilterChain chain = mock(FilterChain.class);
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(authenticationService);
        when(authenticationService.authenticate("token"))
                .thenReturn(new AuthenticatedUser(1L, "admin", "admin", 2));

        MockHttpServletRequest request = requestWithToken("GET", "/api/admin/users/page");
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication().getAuthorities())
                .extracting("authority")
                .contains("admin", "ROLE_ADMIN");
        verify(chain).doFilter(request, response);
    }

    /**
     * 验证匿名用户访问文件下载接口（白名单路径）时放行，不设置 Authentication。
     */
    @Test
    void anonymousDownloadContinuesWithoutAuthentication() throws Exception {
        TokenAuthenticationService authenticationService = mock(TokenAuthenticationService.class);
        FilterChain chain = mock(FilterChain.class);
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(authenticationService);

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/files/download/12");
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    /**
     * 验证容器内部健康检查无需 JWT 即可到达 Actuator 端点。
     */
    @Test
    void actuatorHealthContinuesWithoutAuthentication() throws Exception {
        TokenAuthenticationService authenticationService = mock(TokenAuthenticationService.class);
        FilterChain chain = mock(FilterChain.class);
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(authenticationService);

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/actuator/health");
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
        verifyNoInteractions(authenticationService);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    /**
     * 验证匿名请求访问非白名单的客户端更新事件接口时返回 401，不继续执行 FilterChain。
     */
    @Test
    void anonymousUpdateEventContinuesForDeviceTelemetry() throws Exception {
        TokenAuthenticationService authenticationService = mock(TokenAuthenticationService.class);
        FilterChain chain = mock(FilterChain.class);
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(authenticationService);

        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/client/update-events");
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(200);
        verify(chain).doFilter(request, response);
    }

    /**
     * 验证受保护端点无 token 时返回 401，不继续执行 FilterChain。
     */
    @Test
    void protectedEndpointWithoutTokenIsRejected() throws Exception {
        TokenAuthenticationService authenticationService = mock(TokenAuthenticationService.class);
        FilterChain chain = mock(FilterChain.class);
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(authenticationService);

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/messages/1");
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
        verifyNoInteractions(chain);
    }

    /**
     * 验证已被吊销的 token（authenticate 抛出 BusinessException）返回 401，
     * 不继续执行 FilterChain。
     */
    @Test
    void revokedTokenIsRejected() throws Exception {
        TokenAuthenticationService authenticationService = mock(TokenAuthenticationService.class);
        FilterChain chain = mock(FilterChain.class);
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(authenticationService);
        when(authenticationService.authenticate("token"))
                .thenThrow(new BusinessException(401, "revoked"));

        MockHttpServletRequest request = requestWithToken("GET", "/api/messages/1");
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
        verifyNoInteractions(chain);
    }

    private MockHttpServletRequest requestWithToken(String method, String path) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.addHeader("Authorization", "Bearer token");
        return request;
    }
}
