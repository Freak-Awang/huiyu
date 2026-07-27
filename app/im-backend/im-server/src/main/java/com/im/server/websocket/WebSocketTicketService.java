package com.im.server.websocket;

import com.im.common.entity.SysUser;
import com.im.server.mapper.UserMapper;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;

@Service
public class WebSocketTicketService {

    private static final String PREFIX = "ws-ticket:";
    private static final Duration TTL = Duration.ofSeconds(30);

    private final SecureRandom secureRandom = new SecureRandom();
    private final StringRedisTemplate redisTemplate;
    private final UserMapper userMapper;

    public WebSocketTicketService(StringRedisTemplate redisTemplate, UserMapper userMapper) {
        this.redisTemplate = redisTemplate;
        this.userMapper = userMapper;
    }

    public String issue(Long userId) {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        String ticket = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        redisTemplate.opsForValue().set(PREFIX + ticket, String.valueOf(userId), TTL);
        return ticket;
    }

    public Long consume(String ticket) {
        if (ticket == null || ticket.length() < 40 || ticket.length() > 64) {
            return null;
        }
        String value = redisTemplate.opsForValue().getAndDelete(PREFIX + ticket);
        if (value == null) {
            return null;
        }
        try {
            Long userId = Long.parseLong(value);
            SysUser user = userMapper.selectById(userId);
            return user != null && Integer.valueOf(1).equals(user.getStatus()) ? userId : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
