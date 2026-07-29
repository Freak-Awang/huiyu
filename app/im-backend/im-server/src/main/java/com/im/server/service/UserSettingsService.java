package com.im.server.service;

import com.im.common.dto.UserSettingsVO;
/**
 * 用户设置服务接口：定义客户端个性化设置的读取与保存契约。
 */
public interface UserSettingsService {

    /**
     * 获取用户设置，不存在时返回默认设置。
     *
     * @param userId 用户 ID
     * @return 用户设置视图
     */
    UserSettingsVO getSettings(Long userId);

    /**
     * 保存用户设置（合并默认值后持久化）。
     *
     * @param userId 用户 ID
     * @param settings 设置视图
     * @return 保存后的完整设置
     */
    UserSettingsVO saveSettings(Long userId, UserSettingsVO settings);
}
