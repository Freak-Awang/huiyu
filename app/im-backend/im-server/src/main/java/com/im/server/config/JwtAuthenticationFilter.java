package com.im.server.config;

import com.im.common.util.JwtUtil;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtUtil jwtUtil;
    private final StringRedisTemplate redisTemplate;

    public JwtAuthenticationFilter(JwtUtil jwtUtil, StringRedisTemplate redisTemplate) {
        this.jwtUtil = jwtUtil;
        this.redisTemplate = redisTemplate;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        String method = request.getMethod();
        boolean isPublicFileDownload = path.startsWith("/api/files/download/")
                && (HttpMethod.GET.matches(method) || HttpMethod.HEAD.matches(method));
        return HttpMethod.OPTIONS.matches(request.getMethod())
                || path.startsWith("/api/auth/login")
                || isPublicFileDownload
                || path.startsWith("/ws/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith(BEARER_PREFIX)) {
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":401,\"message\":\"Missing or invalid Authorization header\"}");
            return;
        }

        String token = authHeader.substring(BEARER_PREFIX.length());
        Long userIdLong;
        String role;

        try {
            userIdLong = jwtUtil.getUserIdFromToken(token);
            role = jwtUtil.getRoleFromToken(token);
        } catch (Exception e) {
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":401,\"message\":\"Invalid or expired token\"}");
            return;
        }

        if (Boolean.TRUE.equals(redisTemplate.hasKey("blacklist:" + token))) {
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":401,\"message\":\"Token has been revoked\"}");
            return;
        }

        String userId = userIdLong != null ? String.valueOf(userIdLong) : null;
        if (userId != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            List<SimpleGrantedAuthority> authorities = new ArrayList<>();
            if (role != null && !role.isBlank()) {
                authorities.add(new SimpleGrantedAuthority(role));
                authorities.add(new SimpleGrantedAuthority("ROLE_" + role.toUpperCase()));
            }

            UsernamePasswordAuthenticationToken authenticationToken =
                    new UsernamePasswordAuthenticationToken(userId, null, authorities);
            SecurityContextHolder.getContext().setAuthentication(authenticationToken);
        }

        filterChain.doFilter(request, response);
    }
}
