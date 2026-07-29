package com.im.common.dto;

import lombok.Data;

/**
 * 用户个性化设置视图对象，承载客户端通用设置与通知设置。
 */
@Data
public class UserSettingsVO {
    private GeneralSettings general; // 通用设置
    private NotificationSettings notification; // 通知设置

    /**
     * 通用设置，控制客户端外观与交互行为。
     */
    @Data
    public static class GeneralSettings {
        private String theme; // 主题（如浅色/深色）
        private String sendShortcut; // 发送消息快捷键（如Enter/Ctrl+Enter）
        private String closeBehavior; // 关闭窗口行为（如最小化到托盘/退出）
        private Boolean compactMode; // 是否紧凑模式
    }

    /**
     * 通知设置，控制消息提醒方式。
     */
    @Data
    public static class NotificationSettings {
        private Boolean desktop; // 是否启用桌面通知
        private Boolean sound; // 是否播放提示音
        private Boolean showPreview; // 通知是否显示消息预览
        private Boolean mentionOnly; // 是否仅@时提醒
        private Boolean doNotDisturb; // 是否免打扰
    }
}
