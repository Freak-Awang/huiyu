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

class JwtAuthenticationFilterTest {

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

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

    @Test
    void anonymousUpdateEventIsRejected() throws Exception {
        TokenAuthenticationService authenticationService = mock(TokenAuthenticationService.class);
        FilterChain chain = mock(FilterChain.class);
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter(authenticationService);

        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/client/update-events");
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
        verifyNoInteractions(chain);
    }

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
