package com.im.server.controller;

import com.im.common.dto.LoginRequest;
import com.im.common.dto.LoginResponse;
import com.im.common.result.Result;
import com.im.server.service.AuthService;
import com.im.server.websocket.WebSocketTicketService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * 认证控制器。
 * <p>
 * 提供用户登录、登出、Token 刷新及 WebSocket 连接票据签发接口，
 * URL 前缀为 {@code /api/auth}。登录成功后签发 JWT Token。
 * </p>
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private AuthService authService;

    @Autowired
    private WebSocketTicketService webSocketTicketService;

    /**
     * 用户登录。
     *
     * @param request 登录请求（用户名/密码）
     * @return 登录响应（含 JWT Token）
     */
    @PostMapping("/login")
    public Result<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return Result.success(authService.login(request));
    }

    /**
     * 用户登出。
     *
     * @param authHeader Authorization 请求头（Bearer Token）
     * @return 操作结果
     */
    @PostMapping("/logout")
    public Result<?> logout(@RequestHeader("Authorization") String authHeader) {
        String token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;
        authService.logout(token);
        return Result.ok();
    }

    /**
     * 刷新 Token。
     *
     * @param authHeader Authorization 请求头（Bearer Token）
     * @return 新的登录响应（含新 Token）
     */
    @PostMapping("/refresh")
    public Result<LoginResponse> refresh(@RequestHeader("Authorization") String authHeader) {
        String token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;
        return Result.success(authService.refresh(token));
    }

    /**
     * 签发 WebSocket 连接票据。
     *
     * @return WebSocket 票据响应
     */
    @PostMapping("/ws-ticket")
    public Result<WebSocketTicketResponse> issueWebSocketTicket() {
        String principal = String.valueOf(SecurityContextHolder.getContext().getAuthentication().getPrincipal());
        String ticket = webSocketTicketService.issue(Long.parseLong(principal));
        return Result.success(new WebSocketTicketResponse(ticket));
    }

    public record WebSocketTicketResponse(String ticket) {
    }
}
