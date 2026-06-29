// ?????settings keeps shared UI state and side effects in one Pinia store.
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

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<UserSettings>(cloneSettings(defaultSettings))
  const loaded = ref(false)
  const loading = ref(false)
  const saving = ref(false)

  const general = computed(() => settings.value.general)
  const notification = computed(() => settings.value.notification)

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

  function updateGeneral(patch: Partial<GeneralSettings>) {
    return save({
      general: {
        ...settings.value.general,
        ...patch,
      },
      notification: settings.value.notification,
    })
  }

  function updateNotification(patch: Partial<NotificationSettings>) {
    return save({
      general: settings.value.general,
      notification: {
        ...settings.value.notification,
        ...patch,
      },
    })
  }

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
