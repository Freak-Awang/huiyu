/**
 * 用户设置 API：封装通用设置与通知设置的查询、保存接口，并提供默认配置。
 */
import http from './index'

/** 主题模式 */
export type Theme = 'light' | 'dark'
/** 发送消息快捷键 */
export type SendShortcut = 'enter' | 'ctrlEnter'
/** 关闭窗口行为 */
export type CloseBehavior = 'tray' | 'exit'

/**
 * 通用设置。
 */
export interface GeneralSettings {
  /** 主题：浅色或深色 */
  theme: Theme
  /** 发送快捷键：Enter 或 Ctrl+Enter */
  sendShortcut: SendShortcut
  /** 关闭行为：最小化到托盘或退出程序 */
  closeBehavior: CloseBehavior
  /** 是否启用紧凑模式 */
  compactMode: boolean
}

/**
 * 通知设置。
 */
export interface NotificationSettings {
  /** 是否启用桌面通知 */
  desktop: boolean
  /** 是否启用提示音 */
  sound: boolean
  /** 是否在通知中显示消息预览 */
  showPreview: boolean
  /** 是否仅 @ 我的消息才通知 */
  mentionOnly: boolean
  /** 是否开启免打扰 */
  doNotDisturb: boolean
}

/**
 * 用户设置汇总。
 */
export interface UserSettings {
  /** 通用设置 */
  general: GeneralSettings
  /** 通知设置 */
  notification: NotificationSettings
}

/** 默认用户设置 */
export const defaultSettings: UserSettings = {
  general: {
    theme: 'light',
    sendShortcut: 'enter',
    closeBehavior: 'tray',
    compactMode: false,
  },
  notification: {
    desktop: true,
    sound: true,
    showPreview: true,
    mentionOnly: false,
    doNotDisturb: false,
  },
}

/**
 * 获取当前用户设置。
 * 调用 GET /api/settings
 * @returns 用户设置
 */
export function getSettings() {
  return http.get<UserSettings>('/api/settings')
}

/**
 * 保存用户设置。
 * 调用 PUT /api/settings
 * @param settings 待保存的用户设置
 * @returns 保存后的用户设置
 */
export function saveSettings(settings: UserSettings) {
  return http.put<UserSettings>('/api/settings', settings)
}
