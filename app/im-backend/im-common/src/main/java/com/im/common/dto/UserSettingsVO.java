package com.im.common.dto;

import lombok.Data;

@Data
public class UserSettingsVO {
    private GeneralSettings general;
    private NotificationSettings notification;

    @Data
    public static class GeneralSettings {
        private String theme;
        private String sendShortcut;
        private String closeBehavior;
        private Boolean compactMode;
    }

    @Data
    public static class NotificationSettings {
        private Boolean desktop;
        private Boolean sound;
        private Boolean showPreview;
        private Boolean mentionOnly;
        private Boolean doNotDisturb;
    }
}
