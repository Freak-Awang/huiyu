/**
 * 用户设置 Store：管理通用设置与通知设置的加载、保存与本地合并，
 * 提供按模块更新设置及恢复默认配置的能力。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  defaultSettings,
  getSettings,
  saveSettings,
  type GeneralSettings,
  type NotificationSettings,
  type UserSettings,
} from '../api/settings'

function cloneSettings(settings: UserSettings): UserSettings {
  return {
    general: { ...settings.general },
    notification: { ...settings.notification },
  }
}

function mergeSettings(settings?: Partial<UserSettings> | null): UserSettings {
  return {
    general: {
      ...defaultSettings.general,
      ...(settings?.general || {}),
    },
    notification: {
      ...defaultSettings.notification,
      ...(settings?.notification || {}),
    },
  }
}

/**
 * 用户设置 Store：管理应用设置的加载、保存与本地状态。
 * state: settings - 当前用户设置；loaded - 是否已加载；loading - 加载中；saving - 保存中
 */
export const useSettingsStore = defineStore('settings', () => {
  /** 当前用户设置 */
  const settings = ref<UserSettings>(cloneSettings(defaultSettings))
  /** 是否已从服务器加载过设置 */
  const loaded = ref(false)
  /** 是否正在加载设置 */
  const loading = ref(false)
  /** 是否正在保存设置 */
  const saving = ref(false)

  const general = computed(() => settings.value.general)
  const notification = computed(() => settings.value.notification)

  /** 从服务器加载用户设置，与默认配置合并后更新本地状态 */
  async function load() {
    if (loading.value) return settings.value
    loading.value = true
    try {
      const res = await getSettings()
      settings.value = mergeSettings(res.data)
      loaded.value = true
      return settings.value
    } finally {
      loading.value = false
    }
  }

  /**
   * 保存用户设置到服务器。
   * @param nextSettings 待保存的完整设置对象
   * @returns 保存后的设置
   */
  async function save(nextSettings: UserSettings) {
    const merged = mergeSettings(nextSettings)
    settings.value = cloneSettings(merged)
    saving.value = true
    try {
      const res = await saveSettings(merged)
      settings.value = mergeSettings(res.data)
      loaded.value = true
      return settings.value
    } finally {
      saving.value = false
    }
  }

  /**
   * 更新通用设置（局部更新并自动保存）。
   * @param patch 待更新的通用设置字段
   * @returns 保存后的设置
   */
  function updateGeneral(patch: Partial<GeneralSettings>) {
    return save({
      general: {
        ...settings.value.general,
        ...patch,
      },
      notification: settings.value.notification,
    })
  }

  /**
   * 更新通知设置（局部更新并自动保存）。
   * @param patch 待更新的通知设置字段
   * @returns 保存后的设置
   */
  function updateNotification(patch: Partial<NotificationSettings>) {
    return save({
      general: settings.value.general,
      notification: {
        ...settings.value.notification,
        ...patch,
      },
    })
  }

  /** 重置本地设置为默认值（不影响服务器已保存数据） */
  function resetLocal() {
    settings.value = cloneSettings(defaultSettings)
    loaded.value = false
  }

  return {
    settings,
    general,
    notification,
    loaded,
    loading,
    saving,
    load,
    save,
    updateGeneral,
    updateNotification,
    resetLocal,
  }
})
