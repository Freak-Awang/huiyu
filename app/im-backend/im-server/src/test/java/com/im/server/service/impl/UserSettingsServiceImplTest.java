package com.im.server.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.common.dto.UserSettingsVO;
import com.im.common.entity.ImUserSettings;
import com.im.common.exception.BusinessException;
import com.im.server.mapper.UserSettingsMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

/**
 * 用户设置服务测试，验证默认值返回、首次保存/更新设置、枚举值校验。
 *
 * <p>测试范围：UserSettingsServiceImpl 的 getSettings（默认值）和 saveSettings（insert/update/enum 校验）。</p>
 */
@ExtendWith(MockitoExtension.class)
class UserSettingsServiceImplTest {

    @Mock
    private UserSettingsMapper userSettingsMapper;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private UserSettingsServiceImpl userSettingsService;

    /**
     * 验证无设置记录时返回默认值：theme=light、sendShortcut=enter、closeBehavior=tray、
     * compactMode=false、desktop/sound/showPreview=true、mentionOnly/dnd=false。
     */
    @Test
    void returnsDefaultsWhenNoSettingsExist() {
        when(userSettingsMapper.selectOne(any())).thenReturn(null); // 无记录

        UserSettingsVO settings = userSettingsService.getSettings(10L);

        assertThat(settings.getGeneral().getTheme()).isEqualTo("light");
        assertThat(settings.getGeneral().getSendShortcut()).isEqualTo("enter");
        assertThat(settings.getGeneral().getCloseBehavior()).isEqualTo("tray");
        assertThat(settings.getGeneral().getCompactMode()).isFalse();
        assertThat(settings.getNotification().getDesktop()).isTrue();
        assertThat(settings.getNotification().getSound()).isTrue();
        assertThat(settings.getNotification().getShowPreview()).isTrue();
        assertThat(settings.getNotification().getMentionOnly()).isFalse();
        assertThat(settings.getNotification().getDoNotDisturb()).isFalse();
    }

    /**
     * 验证首次保存设置时执行 insert，generalSettings 和 notificationSettings JSON 正确序列化，
     * 返回的 VO 与请求一致。
     */
    @Test
    void insertsSettingsForFirstSave() {
        when(userSettingsMapper.selectOne(any())).thenReturn(null); // 无已有记录
        UserSettingsVO request = request("dark", "ctrlEnter", "exit", true, false, true);

        UserSettingsVO saved = userSettingsService.saveSettings(10L, request);

        ArgumentCaptor<ImUserSettings> captor = ArgumentCaptor.forClass(ImUserSettings.class);
        verify(userSettingsMapper).insert(captor.capture()); // 首次保存用 insert
        ImUserSettings entity = captor.getValue();
        assertThat(entity.getUserId()).isEqualTo(10L);
        assertThat(entity.getGeneralSettings()).contains("\"theme\":\"dark\"");
        assertThat(entity.getNotificationSettings()).contains("\"desktop\":false");
        assertThat(saved.getGeneral().getSendShortcut()).isEqualTo("ctrlEnter");
        assertThat(saved.getNotification().getMentionOnly()).isTrue();
    }

    /**
     * 验证已有设置时执行 updateById，保留原有 id，JSON 字段正确更新。
     */
    @Test
    void updatesExistingSettings() {
        ImUserSettings existing = new ImUserSettings();
        existing.setId(5L);
        existing.setUserId(10L);
        existing.setGeneralSettings("{\"theme\":\"light\"}");
        existing.setNotificationSettings("{\"desktop\":true}");
        when(userSettingsMapper.selectOne(any())).thenReturn(existing); // 已有记录
        UserSettingsVO request = request("dark", "enter", "tray", false, true, false);

        userSettingsService.saveSettings(10L, request);

        ArgumentCaptor<ImUserSettings> captor = ArgumentCaptor.forClass(ImUserSettings.class);
        verify(userSettingsMapper).updateById(captor.capture()); // 已有记录用 update
        ImUserSettings entity = captor.getValue();
        assertThat(entity.getId()).isEqualTo(5L); // 保留原 id
        assertThat(entity.getGeneralSettings()).contains("\"theme\":\"dark\"");
        assertThat(entity.getNotificationSettings()).contains("\"showPreview\":false");
    }

    /**
     * 验证非法枚举值（如 theme="system"）被拒绝，返回 400，不执行任何 Mapper 操作。
     */
    @Test
    void rejectsInvalidEnums() {
        UserSettingsVO request = request("system", "enter", "tray", false, true, true); // theme="system" 非法

        assertThatThrownBy(() -> userSettingsService.saveSettings(10L, request))
                .isInstanceOf(BusinessException.class)
                .hasMessage("Unsupported theme")
                .extracting("code")
                .isEqualTo(400);
        verifyNoMoreInteractions(userSettingsMapper); // 不执行任何 DB 操作
    }

    private UserSettingsVO request(
            String theme,
            String sendShortcut,
            String closeBehavior,
            boolean compactMode,
            boolean desktop,
            boolean showPreview) {
        UserSettingsVO settings = new UserSettingsVO();
        UserSettingsVO.GeneralSettings general = new UserSettingsVO.GeneralSettings();
        general.setTheme(theme);
        general.setSendShortcut(sendShortcut);
        general.setCloseBehavior(closeBehavior);
        general.setCompactMode(compactMode);
        settings.setGeneral(general);

        UserSettingsVO.NotificationSettings notification = new UserSettingsVO.NotificationSettings();
        notification.setDesktop(desktop);
        notification.setSound(true);
        notification.setShowPreview(showPreview);
        notification.setMentionOnly(true);
        notification.setDoNotDisturb(false);
        settings.setNotification(notification);
        return settings;
    }
}
