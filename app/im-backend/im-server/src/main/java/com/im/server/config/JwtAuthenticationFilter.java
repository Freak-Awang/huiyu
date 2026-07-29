package com.im.server.config;

import com.im.common.exception.BusinessException;
import com.im.server.security.AuthenticatedUser;
import com.im.server.security.TokenAuthenticationService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
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

/**
 * JWT 认证过滤器。
 * <p>
 * 在 Spring Security 过滤链中拦截请求，解析 Authorization 头中的 Bearer Token，
 * 验证 Token 有效性（未过期、未撤销、用户状态正常、Token 版本匹配），
 * 并将认证信息写入 SecurityContext。登录、WebSocket、文件下载等路径放行。
 * </p>
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final TokenAuthenticationService authenticationService;

    public JwtAuthenticationFilter(TokenAuthenticationService authenticationService) {
        this.authenticationService = authenticationService;
    }

    /**
     * 判断当前请求是否跳过 JWT 过滤。
     * <p>
     * 放行 OPTIONS 预检请求、登录接口和 WebSocket 握手路径。
     * 文件下载接口不过滤，由下游自行处理可选的 Bearer Token。
     * </p>
     */
    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // Downloads pass through this filter so a valid optional bearer token can authorize conversation files.
        String path = request.getRequestURI();
        return HttpMethod.OPTIONS.matches(request.getMethod())
                || path.startsWith("/api/auth/login")
                || path.startsWith("/ws/");
    }

    /**
     * 执行 JWT 认证过滤逻辑。
     * <p>
     * 解析 Bearer Token，验证有效性后构建 Authentication 写入 SecurityContext；
     * 对公共更新策略接口和文件下载接口允许无 Token 访问；
     * Token 缺失或无效时返回 401 JSON 响应。
     * </p>
     */
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith(BEARER_PREFIX)) {
            // 公共客户端更新策略接口允许匿名访问
            if (isPublicClientUpdateEndpoint(request) && authHeader == null) {
                filterChain.doFilter(request, response);
                return;
            }
            // 文件下载接口允许匿名访问（由下游鉴权）
            if (isFileDownload(request) && authHeader == null) {
                filterChain.doFilter(request, response);
                return;
            }
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":401,\"message\":\"Missing or invalid Authorization header\"}");
            return;
        }

        String token = authHeader.substring(BEARER_PREFIX.length());
        AuthenticatedUser authenticatedUser;
        try {
            authenticatedUser = authenticationService.authenticate(token);
        } catch (BusinessException e) {
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":401,\"message\":\"Invalid, expired, or revoked token\"}");
            return;
        }

        // 将认证用户信息写入 SecurityContext，同时设置角色和 ROLE_ 前缀权限
        String userId = authenticatedUser.userId() != null ? String.valueOf(authenticatedUser.userId()) : null;
        if (userId != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            List<SimpleGrantedAuthority> authorities = new ArrayList<>();
            String role = authenticatedUser.role();
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

    /**
     * 判断是否为文件下载请求（GET/HEAD）。
     */
    private boolean isFileDownload(HttpServletRequest request) {
        String path = request.getRequestURI();
        String method = request.getMethod();
        return path.startsWith("/api/files/download/")
                && (HttpMethod.GET.matches(method) || HttpMethod.HEAD.matches(method));
    }

    /**
     * 判断是否为公共客户端更新策略查询接口。
     */
    private boolean isPublicClientUpdateEndpoint(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.equals("/api/client/releases/policy");
    }
}
