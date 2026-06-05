package com.im.server.service.impl;

import com.im.common.entity.SysUser;
import com.im.common.exception.BusinessException;
import com.im.server.mapper.UserMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceImplTest {

    @Mock
    private UserMapper userMapper;

    @InjectMocks
    private UserServiceImpl userService;

    @Test
    void updateProfileTrimsAndPersistsSignature() {
        SysUser user = new SysUser();
        user.setId(10L);
        when(userMapper.selectById(10L)).thenReturn(user);

        SysUser saved = userService.updateProfile(10L, "张三", "a@example.com", "13800138000", "  保持专注  ");

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
}
