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

@ExtendWith(MockitoExtension.class)
class WebSocketTicketServiceTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    @Mock
    private UserMapper userMapper;

    @Test
    void issuedTicketIsRandomAndShortLived() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        WebSocketTicketService service = new WebSocketTicketService(redisTemplate, userMapper);

        String ticket = service.issue(42L);

        assertThat(ticket).hasSizeBetween(40, 64);
        verify(valueOperations).set("ws-ticket:" + ticket, "42", Duration.ofSeconds(30));
    }

    @Test
    void consumedTicketRequiresAnActiveCurrentUser() {
        String ticket = "a".repeat(43);
        SysUser user = new SysUser();
        user.setId(42L);
        user.setStatus(1);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.getAndDelete(anyString())).thenReturn("42", null);
        when(userMapper.selectById(42L)).thenReturn(user);
        WebSocketTicketService service = new WebSocketTicketService(redisTemplate, userMapper);

        assertThat(service.consume(ticket)).isEqualTo(42L);
        assertThat(service.consume(ticket)).isNull();
    }
}
