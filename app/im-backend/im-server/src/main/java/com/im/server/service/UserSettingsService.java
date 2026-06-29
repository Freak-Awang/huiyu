package com.im.server.service;

import com.im.common.dto.UserSettingsVO;
/**
 * Intent: UserSettingsService defines the service contract used by controllers and async workflows.
 */

public interface UserSettingsService {
    UserSettingsVO getSettings(Long userId);

    UserSettingsVO saveSettings(Long userId, UserSettingsVO settings);
}
