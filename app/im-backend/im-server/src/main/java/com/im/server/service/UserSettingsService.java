package com.im.server.service;

import com.im.common.dto.UserSettingsVO;

public interface UserSettingsService {
    UserSettingsVO getSettings(Long userId);

    UserSettingsVO saveSettings(Long userId, UserSettingsVO settings);
}
