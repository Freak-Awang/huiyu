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
import static org.mockito.Mockito.never;

import java.util.Set;

/**
 * 用户服务测试，验证个人资料更新、签名长度限制、USER_UPDATED 推送、头像更新、密码修改。
 *
 * <p>测试范围：UserServiceImpl 的 updateProfile（含推送事件）、updateAvatar、admin update、
 * updatePassword（修改密码不推送事件但关闭所有 session）。</p>
 */
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

    /**
     * 验证更新个人资料时签名前后空格被 trim，且持久化到数据库。
     */
    @Test
    void updateProfileTrimsAndPersistsSignature() {
        SysUser user = new SysUser();
        user.setId(10L);
        when(userMapper.selectById(10L)).thenReturn(user);

        UserProfileVO saved = userService.updateProfile(10L, "张三", "a@example.com", "13800138000", "  保持专注  ");

        assertThat(saved.getSignature()).isEqualTo("保持专注"); // trim 后
        ArgumentCaptor<SysUser> captor = ArgumentCaptor.forClass(SysUser.class);
        verify(userMapper).updateById(captor.capture());
        assertThat(captor.getValue().getSignature()).isEqualTo("保持专注");
    }

    /**
     * 验证签名超过 128 字符时抛出 BusinessException(400)。
     */
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

    /**
     * 验证更新个人资料后向所有在线用户推送 USER_UPDATED 事件，
     * 且推送的 JSON 不包含 password 和哈希值（防泄露）。
     */
    @Test
    void updateProfilePublishesSanitizedEventToEveryOnlineUser() {
        SysUser user = new SysUser();
        user.setId(10L);
        user.setUsername("zhangsan");
        user.setPassword("encoded-secret");
        user.setStatus(1);
        when(userMapper.selectById(10L)).thenReturn(user);
        when(sessionManager.getOnlineUserIds()).thenReturn(Set.of(10L, 20L)); // 2 个在线用户

        userService.updateProfile(10L, "张三", "a@example.com", "13800138000", "保持专注");

        ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
        verify(sessionManager, times(2)).sendToUser(any(), payload.capture()); // 每个在线用户推送一次
        assertThat(payload.getAllValues()).allSatisfy(json -> {
            assertThat(json).contains("\"cmd\":\"USER_UPDATED\"");
            assertThat(json).contains("\"userId\":10");
            assertThat(json).doesNotContain("encoded-secret"); // 密码哈希不泄露
            assertThat(json).doesNotContain("password");
        });
    }

    /**
     * 验证头像更新后推送 USER_UPDATED 事件，返回的 avatar URL 正确。
     */
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

    /**
     * 验证管理员更新用户资料后，reload 数据库最新记录并推送 USER_UPDATED 事件。
     */
    @Test
    void adminUpdateReloadsAndPublishesPersistedProfile() {
        SysUser patch = new SysUser();
        patch.setId(10L);
        patch.setNickname("新昵称");
        SysUser saved = new SysUser();
        saved.setId(10L);
        saved.setNickname("新昵称");
        when(userMapper.selectById(10L)).thenReturn(saved); // reload 最新记录
        when(sessionManager.getOnlineUserIds()).thenReturn(Set.of(20L));

        SysUser result = userService.update(patch);

        assertThat(result).isSameAs(saved);
        verify(sessionManager).sendToUser(any(), org.mockito.ArgumentMatchers.contains("新昵称"));
    }

    /**
     * 验证修改密码后关闭所有 session（强制重新登录），但不推送 USER_UPDATED 事件。
     */
    @Test
    void passwordUpdateDoesNotPublishProfileEvent() {
        SysUser user = new SysUser();
        user.setId(10L);
        user.setPassword("old-encoded");
        when(userMapper.selectById(10L)).thenReturn(user);
        when(passwordEncoder.matches("old-password", "old-encoded")).thenReturn(true);
        when(passwordEncoder.encode("new-password")).thenReturn("new-encoded");

        userService.updatePassword(10L, "old-password", "new-password");

        verify(sessionManager).closeSessionsForUser(10L); // 强制下线
        verify(sessionManager, never()).sendToUser(any(), any()); // 不推送事件
    }
}
