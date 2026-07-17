package com.im.server.config;

import com.im.common.util.JwtUtil;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class JwtAuthenticationFilterTest {

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void adminRoleGetsSpringSecurityAuthority() throws Exception {
        JwtUtil jwtUtil = mock(JwtUtil.class);
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        FilterChain chain = mock(FilterChain.class);
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtUtil, redisTemplate);

        when(jwtUtil.getUserIdFromToken("token")).thenReturn(1L);
        when(jwtUtil.getRoleFromToken("token")).thenReturn("admin");
        when(redisTemplate.hasKey("blacklist:token")).thenReturn(false);

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/admin/users/page");
        request.addHeader("Authorization", "Bearer token");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication().getAuthorities())
                .extracting("authority")
                .contains("admin", "ROLE_ADMIN");
        verify(chain).doFilter(request, response);
    }

    @Test
    void anonymousDownloadContinuesWithoutAuthentication() throws Exception {
        JwtUtil jwtUtil = mock(JwtUtil.class);
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        FilterChain chain = mock(FilterChain.class);
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtUtil, redisTemplate);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/files/download/12");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void anonymousClientUpdatePolicyContinuesWithoutAuthentication() throws Exception {
        JwtUtil jwtUtil = mock(JwtUtil.class);
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        FilterChain chain = mock(FilterChain.class);
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtUtil, redisTemplate);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/client/releases/policy");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void protectedEndpointWithoutTokenIsRejected() throws Exception {
        JwtUtil jwtUtil = mock(JwtUtil.class);
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        FilterChain chain = mock(FilterChain.class);
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtUtil, redisTemplate);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/messages/1");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
        verifyNoInteractions(chain);
    }

    @Test
    void bearerTokenOnDownloadPopulatesCurrentUser() throws Exception {
        JwtUtil jwtUtil = mock(JwtUtil.class);
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        FilterChain chain = mock(FilterChain.class);
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(jwtUtil, redisTemplate);
        when(jwtUtil.getUserIdFromToken("token")).thenReturn(7L);
        when(jwtUtil.getRoleFromToken("token")).thenReturn("user");
        when(redisTemplate.hasKey("blacklist:token")).thenReturn(false);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/files/download/12");
        request.addHeader("Authorization", "Bearer token");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication().getPrincipal()).isEqualTo("7");
        verify(chain).doFilter(request, response);
    }
}
