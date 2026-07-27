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
 * Intent: AuthController exposes HTTP endpoints and keeps request validation close to the API boundary.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private AuthService authService;

    @Autowired
    private WebSocketTicketService webSocketTicketService;

    @PostMapping("/login")
    public Result<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return Result.success(authService.login(request));
    }

    @PostMapping("/logout")
    public Result<?> logout(@RequestHeader("Authorization") String authHeader) {
        String token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;
        authService.logout(token);
        return Result.ok();
    }

    @PostMapping("/refresh")
    public Result<LoginResponse> refresh(@RequestHeader("Authorization") String authHeader) {
        String token = authHeader.startsWith("Bearer ") ? authHeader.substring(7) : authHeader;
        return Result.success(authService.refresh(token));
    }

    @PostMapping("/ws-ticket")
    public Result<WebSocketTicketResponse> issueWebSocketTicket() {
        String principal = String.valueOf(SecurityContextHolder.getContext().getAuthentication().getPrincipal());
        String ticket = webSocketTicketService.issue(Long.parseLong(principal));
        return Result.success(new WebSocketTicketResponse(ticket));
    }

    public record WebSocketTicketResponse(String ticket) {
    }
}
