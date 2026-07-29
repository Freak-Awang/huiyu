package com.im.server.websocket;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

/**
 * WebSocket 握手拦截器，在 HTTP 升级为 WebSocket 之前校验 ticket 票据并注入 userId。
 *
 * <p>从请求参数中提取 ticket，调用 {@link WebSocketTicketService#consume} 进行一次性票据校验。
 * 校验通过后将 userId 写入 WebSocket Session attributes，后续 Handler 可直接取出使用；
 * 校验失败则拒绝握手，连接不会建立。</p>
 */
@Component
public class WebSocketHandshakeInterceptor implements HandshakeInterceptor {

    private final WebSocketTicketService ticketService;

    public WebSocketHandshakeInterceptor(WebSocketTicketService ticketService) {
        this.ticketService = ticketService;
    }

    /**
     * 握手前置处理：从 URL 参数中获取 ticket，校验后提取 userId 注入 attributes。
     * 返回 false 则拒绝 WebSocket 升级请求。
     */
    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
                                   WebSocketHandler wsHandler, Map<String, Object> attributes) {
        if (request instanceof ServletServerHttpRequest servletRequest) {
            HttpServletRequest httpRequest = servletRequest.getServletRequest();
            String ticket = httpRequest.getParameter("ticket"); // URL query: ?ticket=xxx
            // consume 是一次性的：读取 Redis 中的 ticket 并立即删除，防止重放
            Long userId = ticketService.consume(ticket);
            if (userId != null) {
                // 将 userId 注入 Session attributes，后续 Handler 可直接读取
                attributes.put("userId", userId);
                return true;
            }
        }
        return false;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
                               WebSocketHandler wsHandler, Exception exception) {
    }
}
