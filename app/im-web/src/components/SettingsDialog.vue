<template>
  <div class="settings-overlay" @click.self="emit('close')">
    <div class="settings-dialog">
      <aside class="settings-nav">
        <div class="settings-profile">
          <div class="settings-avatar">
            <img v-if="authStore.currentUser?.avatar" :src="authStore.currentUser.avatar" alt="" />
            <span v-else>{{ (authStore.currentUser?.nickname || 'U')[0] }}</span>
          </div>
          <div class="settings-user">
            <span>{{ authStore.currentUser?.nickname || authStore.currentUser?.username }}</span>
            <small>{{ authStore.currentUser?.username }}</small>
          </div>
        </div>
        <button
          v-for="item in sections"
          :key="item.key"
          type="button"
          class="settings-nav-item"
          :class="{ active: activeSection === item.key }"
          @click="activeSection = item.key"
        >
          <img v-if="item.iconSrc" :src="item.iconSrc" alt="" />
          <span v-else>{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </button>
      </aside>

      <main class="settings-panel">
        <header class="settings-header">
          <div>
            <h2>{{ activeTitle }}</h2>
            <p>{{ activeHint }}</p>
          </div>
          <button type="button" class="settings-close" title="关闭" @click="emit('close')">×</button>
        </header>

        <section v-if="activeSection === 'general'" class="settings-section">
          <div class="settings-group">
            <label class="setting-row">
              <span>
                <strong>界面主题</strong>
                <small>切换当前客户端的浅色或深色外观</small>
              </span>
              <select
                :value="settingsStore.general.theme"
                :disabled="settingsStore.saving"
                @change="saveGeneral({ theme: ($event.target as HTMLSelectElement).value as any })"
              >
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </label>
            <label class="setting-row">
              <span>
                <strong>发送快捷键</strong>
                <small>选择按 Enter 发送或 Ctrl+Enter 发送</small>
              </span>
              <select
                :value="settingsStore.general.sendShortcut"
                :disabled="settingsStore.saving"
                @change="saveGeneral({ sendShortcut: ($event.target as HTMLSelectElement).value as any })"
              >
                <option value="enter">Enter 发送，Shift+Enter 换行</option>
                <option value="ctrlEnter">Ctrl+Enter 发送</option>
              </select>
            </label>
            <label class="setting-row">
              <span>
                <strong>关闭窗口</strong>
                <small>此设置先同步保存，桌面关闭行为后续接入</small>
              </span>
              <select
                :value="settingsStore.general.closeBehavior"
                :disabled="settingsStore.saving"
                @change="saveGeneral({ closeBehavior: ($event.target as HTMLSelectElement).value as any })"
              >
                <option value="tray">最小化到托盘</option>
                <option value="exit">退出应用</option>
              </select>
            </label>
            <label class="setting-row">
              <span>
                <strong>紧凑模式</strong>
                <small>减少列表和消息区域的间距</small>
              </span>
              <input
                type="checkbox"
                :checked="settingsStore.general.compactMode"
                :disabled="settingsStore.saving"
                @change="saveGeneral({ compactMode: ($event.target as HTMLInputElement).checked })"
              />
            </label>
          </div>
        </section>

        <section v-else-if="activeSection === 'notification'" class="settings-section">
          <div class="settings-group">
            <label class="setting-row" v-for="item in notificationRows" :key="item.key">
              <span>
                <strong>{{ item.title }}</strong>
                <small>{{ item.hint }}</small>
              </span>
              <input
                type="checkbox"
                :checked="settingsStore.notification[item.key]"
                :disabled="settingsStore.saving"
                @change="saveNotification({ [item.key]: ($event.target as HTMLInputElement).checked })"
              />
            </label>
          </div>
        </section>

        <section v-else-if="activeSection === 'about'" class="settings-section">
          <div class="about-card">
            <div>
              <strong>ArtTalk</strong>
              <small>当前版本 {{ updateStore.state.currentVersion || '浏览器版' }}</small>
            </div>
            <span class="update-status">{{ updateStatusText }}</span>
          </div>
          <div v-if="updateStore.state.targetVersion" class="settings-group update-details">
            <div class="setting-row">
              <span><strong>{{ updateStore.state.releaseName || `ArtTalk ${updateStore.state.targetVersion}` }}</strong><small>{{ updateStore.state.releaseDate || '新版本' }}</small></span>
            </div>
            <div v-if="updateStore.state.releaseNotes?.length" class="release-notes">
              <p v-for="note in updateStore.state.releaseNotes" :key="note">{{ note }}</p>
            </div>
            <div v-if="updateStore.state.status === 'downloading'" class="download-progress">
              <span :style="{ width: `${updateStore.state.percent || 0}%` }" />
            </div>
          </div>
          <div class="about-actions">
            <button type="button" class="plain-btn" :disabled="updateStore.isBusy" @click="updateStore.check()">检查更新</button>
            <button v-if="updateStore.state.status === 'available'" type="button" class="plain-btn" @click="updateStore.download()">开始下载</button>
            <button v-if="updateStore.state.status === 'downloaded' || updateStore.state.status === 'waiting-for-transfers'" type="button" class="plain-btn" @click="updateStore.install()">{{ updateStore.state.transferBlockers ? '传输完成后安装' : '立即重启安装' }}</button>
            <select :value="updateStore.channel" @change="updateStore.setChannel(($event.target as HTMLSelectElement).value as 'stable' | 'beta')">
              <option value="stable">正式版</option>
              <option value="beta">测试版</option>
            </select>
          </div>
          <p v-if="updateStore.state.error" class="storage-note update-error">{{ updateStore.state.error }}</p>
        </section>

        <section v-else class="settings-section">
          <div class="storage-summary">
            <div>
              <span class="storage-value">{{ formatSize(storageStats?.cacheSize || 0) }}</span>
              <small>本地消息缓存</small>
            </div>
            <div>
              <span class="storage-value">{{ storageStats?.messageCount || 0 }}</span>
              <small>缓存消息</small>
            </div>
            <div>
              <span class="storage-value">{{ storageStats?.conversationCount || 0 }}</span>
              <small>缓存会话</small>
            </div>
          </div>

          <div class="settings-group">
            <div class="setting-row">
              <span>
                <strong>本地聊天缓存</strong>
                <small>只清理当前设备缓存，不会删除服务器聊天记录</small>
              </span>
              <button type="button" class="danger-btn" :disabled="!canManageLocalMessages" @click="clearLocalCache">
                清理
              </button>
            </div>
            <div class="setting-row">
              <span>
                <strong>最近表情和贴纸</strong>
                <small>清空输入区最近使用记录</small>
              </span>
              <button type="button" class="plain-btn" @click="clearRecentCache">清理</button>
            </div>
          </div>
          <p v-if="!canManageLocalMessages" class="storage-note">浏览器模式下无 Electron 本地消息缓存。</p>
        </section>

        <footer class="settings-footer">
          <span v-if="settingsStore.saving">正在保存...</span>
          <span v-else-if="statusText">{{ statusText }}</span>
        </footer>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
// Intent: SettingsDialog contains reusable UI behavior with local interaction state.

import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useSettingsStore } from '../stores/settings'
import { useUpdateStore } from '../stores/update'
import {
  clearLocalMessages,
  getLocalMessageStats,
  type LocalMessageStats,
} from '../utils/localMessageStore'
import { clearRecentUsageCache } from '../utils/recentUsage'
import type { GeneralSettings, NotificationSettings } from '../api/settings'
import settingsIcon from '../assets/icons/settings.svg'

const emit = defineEmits<{
  close: []
  recentCacheCleared: []
  localCacheCleared: []
}>()

type SectionKey = 'general' | 'notification' | 'storage' | 'about'

const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const updateStore = useUpdateStore()
const activeSection = ref<SectionKey>('general')
const storageStats = ref<LocalMessageStats | null>(null)
const statusText = ref('')

const sections: Array<{ key: SectionKey; label: string; icon: string; iconSrc?: string; hint: string }> = [
  { key: 'general', label: '通用设置', icon: '', iconSrc: settingsIcon, hint: '界面、快捷键和窗口偏好' },
  { key: 'notification', label: '消息通知', icon: '🔔', hint: '桌面通知和消息提醒策略' },
  { key: 'storage', label: '存储管理', icon: '🗄', hint: '查看和清理本机缓存' },
  { key: 'about', label: '关于 ArtTalk', icon: 'i', hint: '版本信息、更新日志和更新通道' },
]

const notificationRows: Array<{
  key: keyof NotificationSettings
  title: string
  hint: string
}> = [
  { key: 'desktop', title: '桌面通知', hint: '收到非当前会话消息时弹出系统通知' },
  { key: 'sound', title: '提示音', hint: '保存提示音偏好，声音素材后续接入' },
  { key: 'showPreview', title: '显示消息预览', hint: '关闭后通知正文隐藏具体内容' },
  { key: 'mentionOnly', title: '仅 @ 我时通知', hint: '普通新消息不再弹出桌面通知' },
  { key: 'doNotDisturb', title: '全局免打扰', hint: '开启后暂停所有桌面通知' },
]

const activeMeta = computed(() => sections.find((item) => item.key === activeSection.value) || sections[0])
const activeTitle = computed(() => activeMeta.value.label)
const activeHint = computed(() => activeMeta.value.hint)
const canManageLocalMessages = computed(() => !!window.imDesktop?.getMessageStats && !!authStore.currentUser?.userId)
const updateStatusText = computed(() => {
  const labels: Record<string, string> = {
    idle: '尚未检查', checking: '正在检查', available: '发现新版本', 'not-available': '已是最新版本',
    downloading: `下载中 ${(updateStore.state.percent || 0).toFixed(1)}%`, downloaded: '等待安装',
    'waiting-for-transfers': '等待传输完成', installing: '正在安装', error: '更新失败',
  }
  return labels[updateStore.state.status] || updateStore.state.status
})

onMounted(() => {
  void loadStorageStats()
  void updateStore.initialize()
})

async function saveGeneral(patch: Partial<GeneralSettings>) {
  try {
    await settingsStore.updateGeneral(patch)
    flashStatus('已保存')
  } catch (err: any) {
    alert(err?.response?.data?.message || err?.message || '保存设置失败')
  }
}

async function saveNotification(patch: Partial<NotificationSettings>) {
  try {
    await settingsStore.updateNotification(patch)
    flashStatus('已保存')
  } catch (err: any) {
    alert(err?.response?.data?.message || err?.message || '保存设置失败')
  }
}

async function loadStorageStats() {
  storageStats.value = await getLocalMessageStats()
}

async function clearLocalCache() {
  if (!confirm('仅清理当前设备的本地聊天缓存，不会删除服务器聊天记录。确定清理吗？')) return
  const ok = await clearLocalMessages()
  if (!ok) {
    alert('清理本地缓存失败')
    return
  }
  emit('localCacheCleared')
  await loadStorageStats()
  flashStatus('本地缓存已清理')
}

function clearRecentCache() {
  clearRecentUsageCache()
  emit('recentCacheCleared')
  flashStatus('最近使用记录已清理')
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function flashStatus(text: string) {
  statusText.value = text
  window.setTimeout(() => {
    if (statusText.value === text) statusText.value = ''
  }, 1600)
}
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.38);
}

.settings-dialog {
  width: min(760px, calc(100vw - 48px));
  height: min(560px, calc(100vh - 48px));
  display: flex;
  overflow: hidden;
  border-radius: 10px;
  background: #f6f7fb;
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.24);
}

.settings-nav {
  width: 210px;
  padding: 18px 12px;
  background: #eceef4;
  border-right: 1px solid #dde0e8;
}

.settings-profile {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 6px 18px;
}

.settings-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  overflow: hidden;
  background: #667eea;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.settings-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.settings-user {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.settings-user span,
.settings-user small {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.settings-user span {
  color: #222;
  font-size: 14px;
  font-weight: 600;
}

.settings-user small {
  color: #8a8f99;
  font-size: 12px;
}

.settings-nav-item {
  width: 100%;
  height: 42px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border-radius: 8px;
  background: transparent;
  color: #4b5563;
  font-size: 14px;
  text-align: left;
}

.settings-nav-item:hover {
  background: #e2e5ee;
}

.settings-nav-item.active {
  background: #fff;
  color: #4f63d8;
  box-shadow: 0 1px 3px rgba(31, 35, 48, 0.08);
}

.settings-nav-item img {
  width: 18px;
  height: 18px;
}

.settings-panel {
  flex: 1;
  display: flex;
  min-width: 0;
  flex-direction: column;
  background: #fff;
}

.settings-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 22px 26px 16px;
  border-bottom: 1px solid #eef0f4;
}

.settings-header h2 {
  margin: 0;
  color: #1f2937;
  font-size: 20px;
}

.settings-header p {
  margin-top: 5px;
  color: #8a8f99;
  font-size: 13px;
}

.settings-close {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  background: transparent;
  color: #8a8f99;
  font-size: 24px;
  line-height: 1;
}

.settings-close:hover {
  background: #f0f1f5;
  color: #333;
}

.settings-section {
  flex: 1;
  overflow-y: auto;
  padding: 20px 26px;
}

.settings-group {
  border: 1px solid #edf0f4;
  border-radius: 8px;
  overflow: hidden;
}

.setting-row {
  min-height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 14px 16px;
  background: #fff;
  border-bottom: 1px solid #edf0f4;
}

.setting-row:last-child {
  border-bottom: none;
}

.setting-row strong {
  display: block;
  color: #273142;
  font-size: 14px;
  font-weight: 600;
}

.setting-row small {
  display: block;
  margin-top: 4px;
  color: #8a8f99;
  font-size: 12px;
}

.setting-row select {
  width: 210px;
  height: 34px;
  border: 1px solid #d8dce6;
  border-radius: 6px;
  background: #fff;
  color: #333;
  padding: 0 9px;
}

.setting-row input[type='checkbox'] {
  width: 18px;
  height: 18px;
  accent-color: #4f63d8;
}

.storage-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.storage-summary > div {
  min-height: 82px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border: 1px solid #edf0f4;
  border-radius: 8px;
  background: #f8f9fc;
  padding: 14px;
}

.storage-value {
  color: #273142;
  font-size: 22px;
  font-weight: 700;
}

.storage-summary small,
.storage-note {
  color: #8a8f99;
  font-size: 12px;
}

.about-card,
.about-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.about-card {
  margin-bottom: 16px;
  padding: 18px;
  border: 1px solid #edf0f4;
  border-radius: 8px;
  background: #f8f9fc;
}

.about-card strong,
.about-card small { display: block; }
.about-card strong { color: #273142; font-size: 20px; }
.about-card small { margin-top: 4px; color: #8a8f99; }
.update-status { color: #4f63d8; font-size: 13px; }
.update-details { margin-bottom: 16px; }
.release-notes { padding: 0 16px 12px; color: #5f6673; font-size: 13px; }
.release-notes p { margin: 6px 0; }
.download-progress { height: 6px; overflow: hidden; background: #e7e9ef; }
.download-progress span { display: block; height: 100%; background: #4f63d8; }
.about-actions { justify-content: flex-start; }
.about-actions select { height: 34px; border: 1px solid #d8dce6; border-radius: 6px; padding: 0 9px; }
.update-error { color: #c62828; }

.danger-btn,
.plain-btn {
  min-width: 72px;
  height: 34px;
  border-radius: 6px;
  font-size: 13px;
}

.danger-btn {
  background: #fff1f0;
  color: #d93026;
}

.danger-btn:hover {
  background: #ffd9d6;
}

.danger-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.plain-btn {
  background: #eef0ff;
  color: #4f63d8;
}

.plain-btn:hover {
  background: #dde2ff;
}

.storage-note {
  margin-top: 12px;
}

.settings-footer {
  height: 34px;
  padding: 0 26px;
  color: #8a8f99;
  font-size: 12px;
}
</style>
