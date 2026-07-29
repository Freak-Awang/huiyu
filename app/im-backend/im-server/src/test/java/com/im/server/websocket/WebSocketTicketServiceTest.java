package com.im.server.websocket;

import com.im.common.entity.SysUser;
import com.im.server.mapper.UserMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * WebSocket 一次性票据服务测试，验证 ticket 签发和消费逻辑。
 *
 * <p>测试范围：WebSocketTicketService 的 issue（生成随机 ticket 并存入 Redis）和
 * consume（一次性消费、用户状态校验）。</p>
 */
@ExtendWith(MockitoExtension.class)
class WebSocketTicketServiceTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    @Mock
    private UserMapper userMapper;

    /**
     * 验证 issue 生成的 ticket 长度在 40~64 之间，且以 ws-ticket: 为前缀存入 Redis，
     * value 为 userId 字符串，TTL 为 30 秒。
     */
    @Test
    void issuedTicketIsRandomAndShortLived() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        WebSocketTicketService service = new WebSocketTicketService(redisTemplate, userMapper);

        String ticket = service.issue(42L);

        assertThat(ticket).hasSizeBetween(40, 64); // Base64URL 编码的 32 字节
        verify(valueOperations).set("ws-ticket:" + ticket, "42", Duration.ofSeconds(30));
    }

    /**
     * 验证 consume 的一次性消费：第一次调用返回 userId，第二次调用（ticket 已删除）返回 null。
     * 同时验证用户状态正常（status=1）才能通过校验。
     */
    @Test
    void consumedTicketRequiresAnActiveCurrentUser() {
        String ticket = "a".repeat(43);
        SysUser user = new SysUser();
        user.setId(42L);
        user.setStatus(1); // 正常状态
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.getAndDelete(anyString())).thenReturn("42", null); // 第一次返回 "42"，第二次返回 null
        when(userMapper.selectById(42L)).thenReturn(user);
        WebSocketTicketService service = new WebSocketTicketService(redisTemplate, userMapper);

        assertThat(service.consume(ticket)).isEqualTo(42L); // 第一次消费成功
        assertThat(service.consume(ticket)).isNull(); // 第二次 ticket 已删除，返回 null
    }
}
