package com.im.server.config;

import com.im.server.websocket.ImWebSocketHandler;
import com.im.server.websocket.WebSocketHandshakeInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * ?????WebSocketConfig centralizes framework configuration so infrastructure behavior stays explicit.
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

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/im")
                .addInterceptors(interceptor)
                .setAllowedOrigins("*");
    }
}
