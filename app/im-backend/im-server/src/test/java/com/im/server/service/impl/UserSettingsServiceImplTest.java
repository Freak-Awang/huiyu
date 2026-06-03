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

@ExtendWith(MockitoExtension.class)
class UserSettingsServiceImplTest {

    @Mock
    private UserSettingsMapper userSettingsMapper;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private UserSettingsServiceImpl userSettingsService;

    @Test
    void returnsDefaultsWhenNoSettingsExist() {
        when(userSettingsMapper.selectOne(any())).thenReturn(null);

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

    @Test
    void insertsSettingsForFirstSave() {
        when(userSettingsMapper.selectOne(any())).thenReturn(null);
        UserSettingsVO request = request("dark", "ctrlEnter", "exit", true, false, true);

        UserSettingsVO saved = userSettingsService.saveSettings(10L, request);

        ArgumentCaptor<ImUserSettings> captor = ArgumentCaptor.forClass(ImUserSettings.class);
        verify(userSettingsMapper).insert(captor.capture());
        ImUserSettings entity = captor.getValue();
        assertThat(entity.getUserId()).isEqualTo(10L);
        assertThat(entity.getGeneralSettings()).contains("\"theme\":\"dark\"");
        assertThat(entity.getNotificationSettings()).contains("\"desktop\":false");
        assertThat(saved.getGeneral().getSendShortcut()).isEqualTo("ctrlEnter");
        assertThat(saved.getNotification().getMentionOnly()).isTrue();
    }

    @Test
    void updatesExistingSettings() {
        ImUserSettings existing = new ImUserSettings();
        existing.setId(5L);
        existing.setUserId(10L);
        existing.setGeneralSettings("{\"theme\":\"light\"}");
        existing.setNotificationSettings("{\"desktop\":true}");
        when(userSettingsMapper.selectOne(any())).thenReturn(existing);
        UserSettingsVO request = request("dark", "enter", "tray", false, true, false);

        userSettingsService.saveSettings(10L, request);

        ArgumentCaptor<ImUserSettings> captor = ArgumentCaptor.forClass(ImUserSettings.class);
        verify(userSettingsMapper).updateById(captor.capture());
        ImUserSettings entity = captor.getValue();
        assertThat(entity.getId()).isEqualTo(5L);
        assertThat(entity.getGeneralSettings()).contains("\"theme\":\"dark\"");
        assertThat(entity.getNotificationSettings()).contains("\"showPreview\":false");
    }

    @Test
    void rejectsInvalidEnums() {
        UserSettingsVO request = request("system", "enter", "tray", false, true, true);

        assertThatThrownBy(() -> userSettingsService.saveSettings(10L, request))
                .isInstanceOf(BusinessException.class)
                .hasMessage("Unsupported theme")
                .extracting("code")
                .isEqualTo(400);
        verifyNoMoreInteractions(userSettingsMapper);
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
