// Intent: settings wraps backend API calls so views and stores do not depend on raw HTTP details.
import http from './index'

export type Theme = 'light' | 'dark'
export type SendShortcut = 'enter' | 'ctrlEnter'
export type CloseBehavior = 'tray' | 'exit'

export interface GeneralSettings {
  theme: Theme
  sendShortcut: SendShortcut
  closeBehavior: CloseBehavior
  compactMode: boolean
}

export interface NotificationSettings {
  desktop: boolean
  sound: boolean
  showPreview: boolean
  mentionOnly: boolean
  doNotDisturb: boolean
}

export interface UserSettings {
  general: GeneralSettings
  notification: NotificationSettings
}

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

export function getSettings() {
  return http.get<UserSettings>('/api/settings')
}

export function saveSettings(settings: UserSettings) {
  return http.put<UserSettings>('/api/settings', settings)
}
