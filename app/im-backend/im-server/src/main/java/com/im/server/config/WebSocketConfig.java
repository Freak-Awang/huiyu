package com.im.server.config;

import com.im.server.websocket.ImWebSocketHandler;
import com.im.server.websocket.WebSocketHandshakeInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * WebSocket 配置。
 * <p>
 * 注册 IM WebSocket 端点 {@code /ws/im}，配置握手拦截器用于认证，
 * 允许跨域连接。客户端通过此端点建立长连接收发实时消息。
 * </p>
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final ImWebSocketHandler handler;
    private final WebSocketHandshakeInterceptor interceptor;

    public WebSocketConfig(ImWebSocketHandler handler, WebSocketHandshakeInterceptor interceptor) {
        this.handler = handler;
        this.interceptor = interceptor;
    }

    /**
     * 注册 WebSocket 处理器。
     * <p>
     * 将 IM 消息处理器绑定到 {@code /ws/im} 端点，
     * 添加握手拦截器用于认证，允许所有来源跨域连接。
     * </p>
     *
     * @param registry WebSocket 处理器注册表
     */
    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/im")
                .addInterceptors(interceptor)
                .setAllowedOrigins("*");
    }
}
