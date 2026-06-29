package com.im.server.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.common.dto.UserSettingsVO;
import com.im.common.entity.ImUserSettings;
import com.im.common.exception.BusinessException;
import com.im.server.mapper.UserSettingsMapper;
import com.im.server.service.UserSettingsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Set;

/**
 * Intent: UserSettingsServiceImpl coordinates domain rules, persistence updates, and cross-service side effects.
 */
@Service
public class UserSettingsServiceImpl implements UserSettingsService {

    private static final Set<String> THEMES = Set.of("light", "dark");
    private static final Set<String> SEND_SHORTCUTS = Set.of("enter", "ctrlEnter");
    private static final Set<String> CLOSE_BEHAVIORS = Set.of("tray", "exit");

    @Autowired
    private UserSettingsMapper userSettingsMapper;

    @Autowired
    private ObjectMapper objectMapper;

    @Override
    public UserSettingsVO getSettings(Long userId) {
        ImUserSettings entity = selectByUserId(userId);
        if (entity == null) {
            return defaultSettings();
        }
        return buildSettings(entity);
    }

    @Override
    @Transactional
    public UserSettingsVO saveSettings(Long userId, UserSettingsVO settings) {
        UserSettingsVO merged = mergeSettings(settings);
        ImUserSettings entity = selectByUserId(userId);
        LocalDateTime now = LocalDateTime.now();
        if (entity == null) {
            entity = new ImUserSettings();
            entity.setUserId(userId);
            entity.setCreateTime(now);
        }
        entity.setGeneralSettings(writeJson(merged.getGeneral()));
        entity.setNotificationSettings(writeJson(merged.getNotification()));
        entity.setUpdateTime(now);

        if (entity.getId() == null) {
            userSettingsMapper.insert(entity);
        } else {
            userSettingsMapper.updateById(entity);
        }
        return merged;
    }

    private ImUserSettings selectByUserId(Long userId) {
        return userSettingsMapper.selectOne(
                new LambdaQueryWrapper<ImUserSettings>()
                        .eq(ImUserSettings::getUserId, userId)
                        .last("LIMIT 1"));
    }

    private UserSettingsVO buildSettings(ImUserSettings entity) {
        UserSettingsVO settings = defaultSettings();
        settings.setGeneral(mergeGeneral(readJson(entity.getGeneralSettings(), UserSettingsVO.GeneralSettings.class)));
        settings.setNotification(mergeNotification(readJson(
                entity.getNotificationSettings(),
                UserSettingsVO.NotificationSettings.class)));
        return settings;
    }

    private UserSettingsVO mergeSettings(UserSettingsVO input) {
        UserSettingsVO merged = new UserSettingsVO();
        merged.setGeneral(mergeGeneral(input != null ? input.getGeneral() : null));
        merged.setNotification(mergeNotification(input != null ? input.getNotification() : null));
        return merged;
    }

    private UserSettingsVO defaultSettings() {
        UserSettingsVO settings = new UserSettingsVO();
        settings.setGeneral(defaultGeneral());
        settings.setNotification(defaultNotification());
        return settings;
    }

    private UserSettingsVO.GeneralSettings defaultGeneral() {
        UserSettingsVO.GeneralSettings general = new UserSettingsVO.GeneralSettings();
        general.setTheme("light");
        general.setSendShortcut("enter");
        general.setCloseBehavior("tray");
        general.setCompactMode(false);
        return general;
    }

    private UserSettingsVO.NotificationSettings defaultNotification() {
        UserSettingsVO.NotificationSettings notification = new UserSettingsVO.NotificationSettings();
        notification.setDesktop(true);
        notification.setSound(true);
        notification.setShowPreview(true);
        notification.setMentionOnly(false);
        notification.setDoNotDisturb(false);
        return notification;
    }

    private UserSettingsVO.GeneralSettings mergeGeneral(UserSettingsVO.GeneralSettings input) {
        UserSettingsVO.GeneralSettings merged = defaultGeneral();
        if (input == null) {
            return merged;
        }
        if (input.getTheme() != null) {
            if (!THEMES.contains(input.getTheme())) {
                throw new BusinessException(400, "Unsupported theme");
            }
            merged.setTheme(input.getTheme());
        }
        if (input.getSendShortcut() != null) {
            if (!SEND_SHORTCUTS.contains(input.getSendShortcut())) {
                throw new BusinessException(400, "Unsupported send shortcut");
            }
            merged.setSendShortcut(input.getSendShortcut());
        }
        if (input.getCloseBehavior() != null) {
            if (!CLOSE_BEHAVIORS.contains(input.getCloseBehavior())) {
                throw new BusinessException(400, "Unsupported close behavior");
            }
            merged.setCloseBehavior(input.getCloseBehavior());
        }
        if (input.getCompactMode() != null) {
            merged.setCompactMode(input.getCompactMode());
        }
        return merged;
    }

    private UserSettingsVO.NotificationSettings mergeNotification(UserSettingsVO.NotificationSettings input) {
        UserSettingsVO.NotificationSettings merged = defaultNotification();
        if (input == null) {
            return merged;
        }
        if (input.getDesktop() != null) {
            merged.setDesktop(input.getDesktop());
        }
        if (input.getSound() != null) {
            merged.setSound(input.getSound());
        }
        if (input.getShowPreview() != null) {
            merged.setShowPreview(input.getShowPreview());
        }
        if (input.getMentionOnly() != null) {
            merged.setMentionOnly(input.getMentionOnly());
        }
        if (input.getDoNotDisturb() != null) {
            merged.setDoNotDisturb(input.getDoNotDisturb());
        }
        return merged;
    }

    private <T> T readJson(String raw, Class<T> clazz) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(raw, clazz);
        } catch (Exception e) {
            return null;
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new BusinessException("Failed to save settings");
        }
    }
}
