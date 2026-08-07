package com.im.server.config;

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

class ReleaseAutomationAuthenticationFilterTest {
    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void exactTokenGrantsOnlyReleaseAutomationAuthority() throws Exception {
        String token = "release-automation-token-at-least-32-chars";
        ReleaseAutomationAuthenticationFilter filter = new ReleaseAutomationAuthenticationFilter(token);
        FilterChain chain = mock(FilterChain.class);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", ReleaseAutomationAuthenticationFilter.PATH);
        request.addHeader(ReleaseAutomationAuthenticationFilter.HEADER, token);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void wrongOrMissingTokenIsRejected() throws Exception {
        ReleaseAutomationAuthenticationFilter filter = new ReleaseAutomationAuthenticationFilter("release-automation-token-at-least-32-chars");
        FilterChain chain = mock(FilterChain.class);
        MockHttpServletRequest request = new MockHttpServletRequest("POST", ReleaseAutomationAuthenticationFilter.PATH);
        request.addHeader(ReleaseAutomationAuthenticationFilter.HEADER, "wrong-secret");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
        verifyNoInteractions(chain);
    }
}
