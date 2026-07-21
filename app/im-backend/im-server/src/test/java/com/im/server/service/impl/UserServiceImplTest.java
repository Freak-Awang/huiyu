package com.im.server.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.im.common.dto.UserProfileVO;
import com.im.common.entity.SysUser;
import com.im.common.exception.BusinessException;
import com.im.server.mapper.DeptMapper;
import com.im.server.mapper.UserMapper;
import com.im.server.websocket.WebSocketSessionManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verifyNoInteractions;

import java.util.Set;

@ExtendWith(MockitoExtension.class)
class UserServiceImplTest {

    @Mock
    private UserMapper userMapper;

    @Mock
    private DeptMapper deptMapper;

    @Mock
    private WebSocketSessionManager sessionManager;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @InjectMocks
    private UserServiceImpl userService;

    @Test
    void updateProfileTrimsAndPersistsSignature() {
        SysUser user = new SysUser();
        user.setId(10L);
        when(userMapper.selectById(10L)).thenReturn(user);

        UserProfileVO saved = userService.updateProfile(10L, "张三", "a@example.com", "13800138000", "  保持专注  ");

        assertThat(saved.getSignature()).isEqualTo("保持专注");
        ArgumentCaptor<SysUser> captor = ArgumentCaptor.forClass(SysUser.class);
        verify(userMapper).updateById(captor.capture());
        assertThat(captor.getValue().getSignature()).isEqualTo("保持专注");
    }

    @Test
    void updateProfileRejectsOverlongSignature() {
        SysUser user = new SysUser();
        user.setId(10L);
        when(userMapper.selectById(10L)).thenReturn(user);

        assertThatThrownBy(() -> userService.updateProfile(10L, "张三", "", "", "x".repeat(129)))
                .isInstanceOf(BusinessException.class)
                .hasMessage("个性签名最多128字")
                .extracting("code")
                .isEqualTo(400);
    }

    @Test
    void updateProfilePublishesSanitizedEventToEveryOnlineUser() {
        SysUser user = new SysUser();
        user.setId(10L);
        user.setUsername("zhangsan");
        user.setPassword("encoded-secret");
        user.setStatus(1);
        when(userMapper.selectById(10L)).thenReturn(user);
        when(sessionManager.getOnlineUserIds()).thenReturn(Set.of(10L, 20L));

        userService.updateProfile(10L, "张三", "a@example.com", "13800138000", "保持专注");

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(sessionManager, times(2)).sendToUser(any(), payload.capture());
        assertThat(payload.getAllValues()).allSatisfy(json -> {
            assertThat(json).contains("\"cmd\":\"USER_UPDATED\"");
            assertThat(json).contains("\"userId\":10");
            assertThat(json).doesNotContain("encoded-secret");
            assertThat(json).doesNotContain("password");
        });
    }

    @Test
    void avatarUpdatePublishesUserUpdated() {
        SysUser user = new SysUser();
        user.setId(10L);
        when(userMapper.selectById(10L)).thenReturn(user);
        when(sessionManager.getOnlineUserIds()).thenReturn(Set.of(20L));

        UserProfileVO saved = userService.updateAvatar(10L, "/api/files/download/99");

        assertThat(saved.getAvatar()).isEqualTo("/api/files/download/99");
        verify(sessionManager).sendToUser(any(), org.mockito.ArgumentMatchers.contains("USER_UPDATED"));
    }

    @Test
    void adminUpdateReloadsAndPublishesPersistedProfile() {
        SysUser patch = new SysUser();
        patch.setId(10L);
        patch.setNickname("新昵称");
        SysUser saved = new SysUser();
        saved.setId(10L);
        saved.setNickname("新昵称");
        when(userMapper.selectById(10L)).thenReturn(saved);
        when(sessionManager.getOnlineUserIds()).thenReturn(Set.of(20L));

        SysUser result = userService.update(patch);

        assertThat(result).isSameAs(saved);
        verify(sessionManager).sendToUser(any(), org.mockito.ArgumentMatchers.contains("新昵称"));
    }

    @Test
    void passwordUpdateDoesNotPublishProfileEvent() {
        SysUser user = new SysUser();
        user.setId(10L);
        user.setPassword("old-encoded");
        when(userMapper.selectById(10L)).thenReturn(user);
        when(passwordEncoder.matches("old-password", "old-encoded")).thenReturn(true);
        when(passwordEncoder.encode("new-password")).thenReturn("new-encoded");

        userService.updatePassword(10L, "old-password", "new-password");

        verifyNoInteractions(sessionManager);
    }
}
