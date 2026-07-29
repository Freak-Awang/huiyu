package com.im.server.websocket;

import com.im.common.entity.SysUser;
import com.im.server.mapper.UserMapper;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;

/**
 * WebSocket 一次性票据服务，用于 WebSocket 握手阶段的安全鉴权。
 *
 * <p>设计意图：</p>
 * <ul>
 *   <li>客户端先通过 HTTP 登录获取 JWT，再用 JWT 调用本服务的 issue 接口获取一次性 ticket。</li>
 *   <li>ticket 为 32 字节安全随机数经 Base64URL 编码，存储在 Redis 中，TTL 30 秒。</li>
 *   <li>WebSocket 连接时将 ticket 作为 URL 参数传入，握手拦截器调用 consume 进行校验。</li>
 *   <li>consume 使用 Redis 的 getAndDelete 原子操作，确保 ticket 只能使用一次，防止重放攻击。</li>
 *   <li>消费时还会校验用户是否存在且状态正常（status=1），已禁用/删除的用户无法建立连接。</li>
 * </ul>
 */
@Service
public class WebSocketTicketService {

    private static final String PREFIX = "ws-ticket:"; // Redis 键前缀
    private static final Duration TTL = Duration.ofSeconds(30); // ticket 有效期 30 秒

    private final SecureRandom secureRandom = new SecureRandom();
    private final StringRedisTemplate redisTemplate;
    private final UserMapper userMapper;

    public WebSocketTicketService(StringRedisTemplate redisTemplate, UserMapper userMapper) {
        this.redisTemplate = redisTemplate;
        this.userMapper = userMapper;
    }

    /**
     * 签发一次性 ticket：生成 32 字节安全随机数 → Base64URL 编码 → 存入 Redis（key=ws-ticket:xxx, value=userId, TTL=30s）。
     *
     * @param userId 已认证的用户 ID
     * @return Base64URL 编码的 ticket 字符串
     */
    public String issue(Long userId) {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);
        String ticket = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        redisTemplate.opsForValue().set(PREFIX + ticket, String.valueOf(userId), TTL);
        return ticket;
    }

    /**
     * 消费（校验并销毁）ticket：长度校验 → Redis getAndDelete（原子操作，一次性消费）→ 用户状态校验。
     *
     * @param ticket URL 参数中的 ticket 字符串
     * @return 校验通过返回 userId，失败返回 null
     */
    public Long consume(String ticket) {
        // 长度校验：Base64URL 编码 32 字节约 43 字符，范围放宽到 40~64
        if (ticket == null || ticket.length() < 40 || ticket.length() > 64) {
            return null;
        }
        // getAndDelete 是原子的：读取后立即删除，确保 ticket 只能被消费一次
        String value = redisTemplate.opsForValue().getAndDelete(PREFIX + ticket);
        if (value == null) {
            return null;
        }
        try {
            Long userId = Long.parseLong(value);
            // 校验用户是否存在且状态正常（status=1）
            SysUser user = userMapper.selectById(userId);
            return user != null && Integer.valueOf(1).equals(user.getStatus()) ? userId : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
