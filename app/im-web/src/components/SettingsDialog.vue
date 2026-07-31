<!-- 桌面设置中心：参考主流桌面 IM 的分栏结构，集中管理账号、通用、通知、快捷键、存储与更新。 -->
<template>
  <div class="settings-overlay" @click.self="emit('close')">
    <div class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <aside class="settings-sidebar">
        <div class="settings-brand">
          <div class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
              <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06-2.78 2.78-.06-.06A1.8 1.8 0 0 0 15 19.4a1.8 1.8 0 0 0-1.1 1.64V21h-3.8v-.08A1.8 1.8 0 0 0 9 19.4a1.8 1.8 0 0 0-1.98.36l-.06.06-2.78-2.78.06-.06A1.8 1.8 0 0 0 4.6 15 1.8 1.8 0 0 0 2.96 13.9H3v-3.8h-.04A1.8 1.8 0 0 0 4.6 9a1.8 1.8 0 0 0-.36-1.98l-.06-.06 2.78-2.78.06.06A1.8 1.8 0 0 0 9 4.6a1.8 1.8 0 0 0 1.1-1.64V3h3.8v.04A1.8 1.8 0 0 0 15 4.6a1.8 1.8 0 0 0 1.98-.36l.06-.06 2.78 2.78-.06.06A1.8 1.8 0 0 0 19.4 9a1.8 1.8 0 0 0 1.64 1.1H21v3.8h.04A1.8 1.8 0 0 0 19.4 15Z" />
            </svg>
          </div>
          <div>
            <strong id="settings-title">设置</strong>
            <small>ArtTalk 桌面端</small>
          </div>
        </div>

        <nav class="settings-nav" aria-label="设置分类">
          <button
            v-for="item in sections"
            :key="item.key"
            type="button"
            class="settings-nav-item"
            :class="{ active: activeSection === item.key }"
            :aria-current="activeSection === item.key ? 'page' : undefined"
            @click="selectSection(item.key)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path :d="item.icon" />
            </svg>
            <span>{{ item.label }}</span>
          </button>
        </nav>

        <div class="sidebar-account">
          <div class="sidebar-avatar">
            <img v-if="authStore.currentUser?.avatar" :src="authStore.currentUser.avatar" alt="" />
            <span v-else>{{ avatarText }}</span>
          </div>
          <div>
            <strong>{{ displayName }}</strong>
            <small>{{ authStore.currentUser?.username }}</small>
          </div>
        </div>
      </aside>

      <main class="settings-main">
        <header class="settings-header">
          <div>
            <h2>{{ activeMeta.label }}</h2>
            <p>{{ activeMeta.hint }}</p>
          </div>
          <button type="button" class="icon-button close-button" aria-label="关闭设置" @click="emit('close')">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>

        <div class="settings-content">
          <section v-if="activeSection === 'account'" class="settings-page account-page">
            <div class="account-hero">
              <div class="account-avatar">
                <img v-if="authStore.currentUser?.avatar" :src="authStore.currentUser.avatar" alt="" />
                <span v-else>{{ avatarText }}</span>
              </div>
              <div class="account-identity">
                <h3>{{ displayName }}</h3>
                <p>账号：{{ authStore.currentUser?.username || '未设置' }}</p>
                <span class="status-badge"><i></i> 当前设备已登录</span>
              </div>
              <button type="button" class="secondary-button" @click="emit('openProfile')">编辑个人资料</button>
            </div>

            <div class="setting-card">
              <div class="setting-card-row">
                <div class="setting-copy">
                  <strong>当前登录账号</strong>
                  <small>退出后，本机缓存不会自动删除</small>
                </div>
                <button type="button" class="danger-text-button" @click="emit('logout')">退出登录</button>
              </div>
              <div class="setting-card-row">
                <div class="setting-copy">
                  <strong>本地数据保护</strong>
                  <small>聊天缓存使用操作系统安全存储加密，仅当前设备可读取</small>
                </div>
                <span class="safe-label">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 12 3 3 7-7" /></svg>
                  已保护
                </span>
              </div>
            </div>
          </section>

          <section v-else-if="activeSection === 'general'" class="settings-page">
            <h3 class="group-title">外观</h3>
            <div class="setting-card">
              <div class="setting-card-row">
                <div class="setting-copy">
                  <strong>界面主题</strong>
                  <small>选择适合当前环境的显示外观</small>
                </div>
                <div class="segmented-control" aria-label="界面主题">
                  <button
                    type="button"
                    :class="{ active: settingsStore.general.theme === 'light' }"
                    :disabled="settingsStore.saving"
                    @click="saveGeneral({ theme: 'light' })"
                  >
                    浅色
                  </button>
                  <button
                    type="button"
                    :class="{ active: settingsStore.general.theme === 'dark' }"
                    :disabled="settingsStore.saving"
                    @click="saveGeneral({ theme: 'dark' })"
                  >
                    深色
                  </button>
                </div>
              </div>
              <label class="setting-card-row">
                <span class="setting-copy">
                  <strong>紧凑模式</strong>
                  <small>缩小会话列表和消息区域的间距，显示更多内容</small>
                </span>
                <input
                  class="switch-input"
                  type="checkbox"
                  :checked="settingsStore.general.compactMode"
                  :disabled="settingsStore.saving"
                  @change="saveGeneral({ compactMode: ($event.target as HTMLInputElement).checked })"
                />
                <span class="switch-control" aria-hidden="true"></span>
              </label>
            </div>

            <h3 class="group-title">窗口</h3>
            <div class="setting-card">
              <div class="setting-card-row">
                <div class="setting-copy">
                  <strong>关闭主窗口时</strong>
                  <small>选择继续在后台接收消息，或直接退出应用</small>
                </div>
                <select
                  class="setting-select"
                  aria-label="关闭主窗口时"
                  :value="settingsStore.general.closeBehavior"
                  :disabled="settingsStore.saving"
                  @change="saveGeneral({ closeBehavior: ($event.target as HTMLSelectElement).value as CloseBehavior })"
                >
                  <option value="tray">最小化到托盘</option>
                  <option value="exit">退出 ArtTalk</option>
                </select>
              </div>
            </div>
          </section>

          <section v-else-if="activeSection === 'notification'" class="settings-page">
            <h3 class="group-title">消息提醒</h3>
            <div class="setting-card">
              <label v-for="item in notificationRows" :key="item.key" class="setting-card-row">
                <span class="setting-copy">
                  <strong>{{ item.title }}</strong>
                  <small>{{ item.hint }}</small>
                </span>
                <input
                  class="switch-input"
                  type="checkbox"
                  :checked="settingsStore.notification[item.key]"
                  :disabled="settingsStore.saving || (item.key !== 'doNotDisturb' && settingsStore.notification.doNotDisturb)"
                  @change="saveNotification({ [item.key]: ($event.target as HTMLInputElement).checked })"
                />
                <span class="switch-control" aria-hidden="true"></span>
              </label>
            </div>
            <div v-if="settingsStore.notification.doNotDisturb" class="settings-tip">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v4l2.5 1.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
              免打扰已开启，其他消息提醒选项暂时不会生效。
            </div>
          </section>

          <section v-else-if="activeSection === 'shortcuts'" class="settings-page">
            <h3 class="group-title">聊天快捷键</h3>
            <div class="setting-card">
              <div class="setting-card-row">
                <div class="setting-copy">
                  <strong>发送消息</strong>
                  <small>设置输入框中发送消息的按键组合</small>
                </div>
                <select
                  class="setting-select shortcut-select"
                  aria-label="发送消息快捷键"
                  :value="settingsStore.general.sendShortcut"
                  :disabled="settingsStore.saving"
                  @change="saveGeneral({ sendShortcut: ($event.target as HTMLSelectElement).value as SendShortcut })"
                >
                  <option value="enter">Enter</option>
                  <option value="ctrlEnter">Ctrl + Enter</option>
                </select>
              </div>
            </div>

            <h3 class="group-title">快捷键提示</h3>
            <div class="setting-card shortcut-list">
              <div v-for="item in shortcutRows" :key="item.title" class="shortcut-row">
                <div class="setting-copy">
                  <strong>{{ item.title }}</strong>
                  <small>{{ item.hint }}</small>
                </div>
                <div class="keycap-group">
                  <kbd v-for="key in item.keys" :key="key">{{ key }}</kbd>
                </div>
              </div>
            </div>
          </section>

          <section v-else-if="activeSection === 'storage'" class="settings-page">
            <h3 class="group-title">本机数据</h3>
            <div class="setting-card storage-card">
              <div class="setting-card-row storage-space-row">
                <div class="setting-copy">
                  <strong>存储空间</strong>
                  <small>{{ storageSummaryText }}</small>
                </div>
                <button type="button" class="secondary-button compact-button" @click="showStorageManager = true">
                  管理
                </button>
              </div>
              <div class="setting-card-row storage-location-row">
                <div class="setting-copy storage-path-copy">
                  <strong>存储位置</strong>
                  <small :title="storageLocation">{{ storageLocationText }}</small>
                </div>
                <div class="row-actions">
                  <button
                    type="button"
                    class="text-button"
                    :disabled="!canUseStorageLocation || changingStorageLocation"
                    @click="changeStorageLocation"
                  >
                    {{ changingStorageLocation ? '更改中' : '更改' }}
                  </button>
                  <button
                    type="button"
                    class="secondary-button compact-button"
                    :disabled="!canUseStorageLocation || !storageLocation"
                    @click="openStorageLocation"
                  >
                    打开文件夹
                  </button>
                </div>
              </div>
            </div>
            <p v-if="storageLocationError" class="inline-error">{{ storageLocationError }}</p>
            <p v-else-if="!canUseStorageLocation" class="page-note">浏览器模式下无法更改本机文件存储位置。</p>
          </section>

          <section v-else class="settings-page">
            <div class="about-hero">
              <div class="about-logo">A</div>
              <div>
                <h3>ArtTalk</h3>
                <p>简洁、安全的团队即时通讯工具</p>
                <span>当前版本 {{ updateStore.state.currentVersion || '浏览器版' }}</span>
              </div>
            </div>

            <h3 class="group-title">软件更新</h3>
            <div class="setting-card">
              <div class="setting-card-row">
                <div class="setting-copy">
                  <strong>{{ updateStatusTitle }}</strong>
                  <small>{{ updateStatusHint }}</small>
                </div>
                <div class="row-actions">
                  <button
                    v-if="updateStore.state.status === 'available'"
                    type="button"
                    class="primary-button"
                    @click="updateStore.download()"
                  >
                    下载更新
                  </button>
                  <button
                    v-else-if="updateStore.state.status === 'downloaded' || updateStore.state.status === 'waiting-for-transfers'"
                    type="button"
                    class="primary-button"
                    @click="updateStore.install()"
                  >
                    {{ updateStore.state.transferBlockers ? '传输完成后安装' : '立即安装' }}
                  </button>
                  <button
                    v-else
                    type="button"
                    class="secondary-button"
                    :disabled="updateStore.isBusy"
                    @click="updateStore.check()"
                  >
                    {{ updateStore.state.status === 'checking' ? '检查中...' : '检查更新' }}
                  </button>
                </div>
              </div>
              <div class="setting-card-row">
                <div class="setting-copy">
                  <strong>更新通道</strong>
                  <small>正式版更稳定，测试版可提前体验新功能</small>
                </div>
                <select
                  class="setting-select"
                  aria-label="更新通道"
                  :value="updateStore.channel"
                  @change="updateStore.setChannel(($event.target as HTMLSelectElement).value as 'stable' | 'beta')"
                >
                  <option value="stable">正式版</option>
                  <option value="beta">测试版</option>
                </select>
              </div>
            </div>

            <div v-if="updateStore.state.status === 'downloading'" class="update-progress-card">
              <div><span>正在下载更新</span><strong>{{ (updateStore.state.percent || 0).toFixed(1) }}%</strong></div>
              <div class="update-progress"><span :style="{ width: `${updateStore.state.percent || 0}%` }"></span></div>
            </div>
            <p v-if="updateStore.state.error" class="inline-error">{{ updateStore.state.error }}</p>
          </section>
        </div>

        <footer class="settings-footer" aria-live="polite">
          <span v-if="settingsStore.saving" class="saving-indicator"><i></i> 正在保存</span>
          <span v-else-if="statusText" class="saved-indicator">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-8" /></svg>
            {{ statusText }}
          </span>
        </footer>
      </main>

      <div v-if="showStorageManager" class="nested-overlay" @click.self="showStorageManager = false">
        <section class="storage-manager" role="dialog" aria-modal="true" aria-labelledby="storage-manager-title">
          <header>
            <div>
              <h3 id="storage-manager-title">存储空间管理</h3>
              <p>清理操作仅影响当前设备，不会删除服务器聊天记录</p>
            </div>
            <button type="button" class="icon-button" aria-label="关闭存储空间管理" @click="showStorageManager = false">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
          </header>
          <div class="storage-manager-body">
            <div class="storage-metrics">
              <div>
                <span>{{ formatSize(storageStats?.cacheSize || 0) }}</span>
                <small>消息缓存</small>
              </div>
              <div>
                <span>{{ storageStats?.messageCount || 0 }}</span>
                <small>缓存消息</small>
              </div>
              <div>
                <span>{{ storageStats?.conversationCount || 0 }}</span>
                <small>缓存会话</small>
              </div>
            </div>
            <div class="setting-card">
              <div class="setting-card-row">
                <div class="setting-copy">
                  <strong>本地聊天缓存</strong>
                  <small>清除离线消息副本，稍后可从服务器重新同步</small>
                </div>
                <button
                  type="button"
                  class="danger-button"
                  :disabled="!canManageLocalMessages"
                  @click="clearLocalCache"
                >
                  清理
                </button>
              </div>
              <div class="setting-card-row">
                <div class="setting-copy">
                  <strong>最近表情和贴纸</strong>
                  <small>清除输入区的最近使用记录</small>
                </div>
                <button type="button" class="secondary-button compact-button" @click="clearRecentCache">清理</button>
              </div>
            </div>
            <p v-if="!canManageLocalMessages" class="page-note">浏览器模式下没有 Electron 本地消息缓存。</p>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useSettingsStore } from '../stores/settings'
import { useUpdateStore } from '../stores/update'
import {
  clearLocalMessages,
  getLocalMessageStats,
  type LocalMessageStats,
} from '../utils/localMessageStore'
import { clearRecentUsageCache } from '../utils/recentUsage'
import type {
  CloseBehavior,
  GeneralSettings,
  NotificationSettings,
  SendShortcut,
} from '../api/settings'

const emit = defineEmits<{
  close: []
  logout: []
  openProfile: []
  recentCacheCleared: []
  localCacheCleared: []
}>()

type SectionKey = 'account' | 'general' | 'notification' | 'shortcuts' | 'storage' | 'about'

const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const updateStore = useUpdateStore()
const activeSection = ref<SectionKey>('account')
const storageStats = ref<LocalMessageStats | null>(null)
const storageStatsLoaded = ref(false)
const storageLocation = ref('')
const storageLocationError = ref('')
const changingStorageLocation = ref(false)
const showStorageManager = ref(false)
const statusText = ref('')

const sections: Array<{ key: SectionKey; label: string; hint: string; icon: string }> = [
  {
    key: 'account',
    label: '账号与安全',
    hint: '管理个人资料、登录状态与本地数据保护',
    icon: 'M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  },
  {
    key: 'general',
    label: '通用',
    hint: '设置界面外观、布局和窗口行为',
    icon: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6',
  },
  {
    key: 'notification',
    label: '消息通知',
    hint: '控制新消息的提醒方式与显示内容',
    icon: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4',
  },
  {
    key: 'shortcuts',
    label: '快捷键',
    hint: '调整发送按键并查看常用操作快捷方式',
    icon: 'M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10M4 4h16v16H4z',
  },
  {
    key: 'storage',
    label: '文件与存储',
    hint: '管理本地缓存、下载目录和存储空间',
    icon: 'M3 7h7l2 2h9v10H3V7ZM3 7V5h7l2 2',
  },
  {
    key: 'about',
    label: '关于 ArtTalk',
    hint: '查看版本信息、更新状态和更新通道',
    icon: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 10v7M12 7h.01',
  },
]

const notificationRows: Array<{
  key: keyof NotificationSettings
  title: string
  hint: string
}> = [
  { key: 'desktop', title: '桌面通知', hint: '收到非当前会话消息时显示系统通知' },
  { key: 'sound', title: '新消息提示音', hint: '收到新消息时播放提示音' },
  { key: 'showPreview', title: '通知中显示消息内容', hint: '关闭后，通知仅显示“收到一条新消息”' },
  { key: 'mentionOnly', title: '仅在有人 @ 我时通知', hint: '普通新消息不再弹出桌面通知' },
  { key: 'doNotDisturb', title: '免打扰', hint: '暂停所有桌面通知和提示音' },
]

const shortcutRows = computed(() => [
  {
    title: '输入换行',
    hint: '在不发送消息的情况下另起一行',
    keys: settingsStore.general.sendShortcut === 'enter' ? ['Shift', 'Enter'] : ['Enter'],
  },
  { title: '打开设置', hint: '从主界面快速进入设置中心', keys: ['Ctrl', ','] },
  { title: '关闭当前弹窗', hint: '关闭设置、图片预览等浮层', keys: ['Esc'] },
  { title: '屏幕截图', hint: '也可以使用聊天输入区上方的截图按钮', keys: ['Ctrl', 'Shift', 'A'] },
])

const activeMeta = computed(() => sections.find((item) => item.key === activeSection.value) || sections[0])
const displayName = computed(() => authStore.currentUser?.nickname || authStore.currentUser?.username || 'ArtTalk 用户')
const avatarText = computed(() => displayName.value.slice(0, 1).toUpperCase())
const canManageLocalMessages = computed(() => !!window.imDesktop?.getMessageStats && !!authStore.currentUser?.userId)
const canUseStorageLocation = computed(() => (
  !!window.imDesktop?.getStorageLocation
  && !!window.imDesktop?.chooseStorageLocation
  && !!window.imDesktop?.openStorageLocation
))
const storageLocationText = computed(() => {
  if (storageLocation.value) return storageLocation.value
  return canUseStorageLocation.value ? '正在读取...' : '浏览器模式'
})
const storageSummaryText = computed(() => {
  if (!storageStatsLoaded.value) return '正在统计本机数据'
  if (!storageStats.value) return '桌面客户端中可查看本机缓存占用'
  return `已使用 ${formatSize(storageStats.value.cacheSize)}，共 ${storageStats.value.messageCount} 条缓存消息`
})
const updateStatusTitle = computed(() => {
  const labels: Record<string, string> = {
    idle: '检查软件更新',
    checking: '正在检查更新',
    available: `发现新版本 ${updateStore.state.targetVersion || ''}`,
    'not-available': '已是最新版本',
    downloading: '正在下载更新',
    downloaded: '更新已下载',
    'waiting-for-transfers': '等待文件传输完成',
    installing: '正在安装更新',
    error: '更新检查失败',
  }
  return labels[updateStore.state.status] || '软件更新'
})
const updateStatusHint = computed(() => {
  if (updateStore.state.releaseName) return updateStore.state.releaseName
  if (updateStore.state.lastCheckedAt) {
    return `上次检查：${new Date(updateStore.state.lastCheckedAt).toLocaleString()}`
  }
  return '保持 ArtTalk 为最新版本，以获得功能改进和安全更新'
})

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown)
  void loadStorageStats()
  void loadStorageLocation()
  void updateStore.initialize()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
})

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (showStorageManager.value) {
    showStorageManager.value = false
    return
  }
  emit('close')
}

function selectSection(section: SectionKey) {
  activeSection.value = section
  showStorageManager.value = false
}

async function saveGeneral(patch: Partial<GeneralSettings>) {
  try {
    await settingsStore.updateGeneral(patch)
    flashStatus('设置已保存')
  } catch (err: any) {
    alert(err?.response?.data?.message || err?.message || '保存设置失败')
  }
}

async function saveNotification(patch: Partial<NotificationSettings>) {
  try {
    await settingsStore.updateNotification(patch)
    flashStatus('设置已保存')
  } catch (err: any) {
    alert(err?.response?.data?.message || err?.message || '保存设置失败')
  }
}

async function loadStorageStats() {
  try {
    storageStats.value = await getLocalMessageStats()
  } finally {
    storageStatsLoaded.value = true
  }
}

async function loadStorageLocation() {
  if (!window.imDesktop?.getStorageLocation) return
  storageLocationError.value = ''
  try {
    storageLocation.value = await window.imDesktop.getStorageLocation()
  } catch (err) {
    storageLocationError.value = errorMessage(err, '读取存储位置失败')
  }
}

async function changeStorageLocation() {
  if (!window.imDesktop?.chooseStorageLocation || changingStorageLocation.value) return
  changingStorageLocation.value = true
  storageLocationError.value = ''
  try {
    const result = await window.imDesktop.chooseStorageLocation()
    if (!result.canceled && result.path) {
      storageLocation.value = result.path
      flashStatus('存储位置已更改')
    }
  } catch (err) {
    storageLocationError.value = errorMessage(err, '更改存储位置失败')
  } finally {
    changingStorageLocation.value = false
  }
}

async function openStorageLocation() {
  if (!window.imDesktop?.openStorageLocation) return
  storageLocationError.value = ''
  try {
    const result = await window.imDesktop.openStorageLocation()
    if (!result.success) storageLocationError.value = result.error || '打开存储位置失败'
  } catch (err) {
    storageLocationError.value = errorMessage(err, '打开存储位置失败')
  }
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
  flashStatus('本地聊天缓存已清理')
}

function clearRecentCache() {
  clearRecentUsageCache()
  emit('recentCacheCleared')
  flashStatus('最近使用记录已清理')
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

function flashStatus(text: string) {
  statusText.value = text
  window.setTimeout(() => {
    if (statusText.value === text) statusText.value = ''
  }, 1800)
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
  padding: 24px;
  background: var(--bg-overlay);
}

.settings-dialog {
  position: relative;
  width: min(900px, calc(100vw - 48px));
  height: min(640px, calc(100vh - 48px));
  display: grid;
  grid-template-columns: 214px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--bg-surface);
  box-shadow: var(--shadow-dialog);
}

.settings-sidebar {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 20px 12px 14px;
  border-right: 1px solid var(--border-subtle);
  background: var(--bg-panel);
}

.settings-brand,
.sidebar-account,
.setting-card-row,
.shortcut-row,
.settings-header,
.account-hero,
.about-hero,
.storage-manager header {
  display: flex;
  align-items: center;
}

.settings-brand {
  gap: 11px;
  padding: 0 9px 19px;
}

.brand-mark {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--accent);
  color: var(--accent-text-on);
}

.brand-mark svg {
  width: 21px;
  height: 21px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.75;
}

.settings-brand strong,
.settings-brand small,
.sidebar-account strong,
.sidebar-account small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-brand strong {
  color: var(--text-primary);
  font-size: var(--font-lg);
  font-weight: 600;
}

.settings-brand small {
  margin-top: 2px;
  color: var(--text-tertiary);
  font-size: var(--font-xs);
}

.settings-nav {
  display: grid;
  gap: 4px;
}

.settings-nav-item {
  width: 100%;
  height: 42px;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 12px;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--font-base);
  text-align: left;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.settings-nav-item:hover {
  background: var(--bg-hover-light);
  color: var(--text-primary);
}

.settings-nav-item.active {
  background: var(--accent-bg-light);
  color: var(--accent);
  font-weight: 600;
}

.settings-nav-item svg,
.settings-tip svg,
.saved-indicator svg,
.safe-label svg {
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.settings-nav-item svg {
  width: 18px;
  height: 18px;
}

.sidebar-account {
  min-width: 0;
  gap: 9px;
  margin-top: auto;
  padding: 12px 8px 0;
  border-top: 1px solid var(--border-subtle);
}

.sidebar-avatar,
.account-avatar {
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 50%;
  background: var(--accent-avatar);
  color: var(--accent-text-on);
  display: grid;
  place-items: center;
}

.sidebar-avatar {
  width: 32px;
  height: 32px;
  font-size: var(--font-sm);
}

.sidebar-avatar img,
.account-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sidebar-account > div:last-child {
  min-width: 0;
}

.sidebar-account strong {
  color: var(--text-primary);
  font-size: var(--font-sm);
  font-weight: 500;
}

.sidebar-account small {
  margin-top: 2px;
  color: var(--text-tertiary);
  font-size: var(--font-2xs);
}

.settings-main {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) 34px;
  background: var(--bg-surface);
}

.settings-header {
  min-height: 75px;
  justify-content: space-between;
  padding: 17px 24px 14px;
  border-bottom: 1px solid var(--border-subtle);
}

.settings-header h2 {
  color: var(--text-primary);
  font-size: var(--font-xl);
  font-weight: 600;
}

.settings-header p {
  margin-top: 4px;
  color: var(--text-tertiary);
  font-size: var(--font-sm);
}

.icon-button {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 7px;
  background: transparent;
  color: var(--text-tertiary);
  transition: background var(--transition-fast), color var(--transition-fast);
}

.icon-button:hover {
  background: var(--bg-hover-light);
  color: var(--text-primary);
}

.icon-button svg {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 1.8;
}

.settings-content {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.settings-page {
  width: min(620px, 100%);
  margin: 0 auto;
  padding: 24px 26px 32px;
}

.group-title {
  margin: 0 0 9px 2px;
  color: var(--text-secondary);
  font-size: var(--font-sm);
  font-weight: 500;
}

.group-title:not(:first-child) {
  margin-top: 22px;
}

.setting-card {
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--bg-surface);
}

.setting-card-row,
.shortcut-row {
  min-height: 66px;
  justify-content: space-between;
  gap: 20px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.setting-card-row:last-child,
.shortcut-row:last-child {
  border-bottom: none;
}

label.setting-card-row {
  cursor: pointer;
}

.setting-copy {
  min-width: 0;
}

.setting-copy strong,
.setting-copy small {
  display: block;
}

.setting-copy strong {
  color: var(--text-primary);
  font-size: var(--font-md);
  font-weight: 500;
}

.setting-copy small {
  margin-top: 4px;
  color: var(--text-tertiary);
  font-size: var(--font-sm);
  line-height: 1.45;
}

.setting-select {
  min-width: 150px;
  height: 34px;
  flex: 0 0 auto;
  padding: 0 30px 0 10px;
  border: 1px solid var(--border-input);
  border-radius: 7px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: var(--font-base);
}

.shortcut-select {
  min-width: 135px;
}

.segmented-control {
  display: grid;
  grid-template-columns: repeat(2, 72px);
  flex: 0 0 auto;
  padding: 3px;
  border-radius: 8px;
  background: var(--bg-header);
}

.segmented-control button {
  height: 30px;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--font-base);
}

.segmented-control button.active {
  background: var(--bg-surface);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
  font-weight: 500;
}

.switch-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.switch-control {
  position: relative;
  width: 38px;
  height: 22px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--bg-input-rest);
  transition: background var(--transition-fast);
}

.switch-control::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
  content: '';
  transition: transform var(--transition-fast);
}

.switch-input:checked + .switch-control {
  background: var(--accent);
}

.switch-input:checked + .switch-control::after {
  transform: translateX(16px);
}

.switch-input:focus-visible + .switch-control {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.switch-input:disabled + .switch-control {
  opacity: 0.5;
}

.account-hero {
  gap: 16px;
  margin-bottom: 22px;
  padding: 18px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--bg-chat);
}

.account-avatar {
  width: 58px;
  height: 58px;
  font-size: 22px;
}

.account-identity {
  min-width: 0;
  flex: 1;
}

.account-identity h3 {
  overflow: hidden;
  color: var(--text-primary);
  font-size: var(--font-lg);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-identity p {
  margin-top: 4px;
  color: var(--text-tertiary);
  font-size: var(--font-sm);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 7px;
  color: var(--success);
  font-size: var(--font-xs);
}

.status-badge i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
}

.primary-button,
.secondary-button,
.danger-button,
.danger-text-button,
.text-button {
  min-height: 34px;
  flex: 0 0 auto;
  padding: 0 13px;
  border-radius: 7px;
  font-size: var(--font-base);
  transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
}

.primary-button {
  background: var(--accent);
  color: var(--accent-text-on);
}

.primary-button:hover {
  background: var(--accent-hover);
}

.secondary-button {
  border: 1px solid var(--border-input);
  background: var(--bg-surface);
  color: var(--text-primary);
}

.secondary-button:hover:not(:disabled) {
  background: var(--bg-hover-light);
}

.compact-button {
  min-height: 30px;
  padding: 0 11px;
}

.danger-button {
  background: var(--danger-bg);
  color: var(--danger-strong);
}

.danger-button:hover:not(:disabled) {
  filter: brightness(0.97);
}

.danger-text-button,
.text-button {
  background: transparent;
}

.danger-text-button {
  color: var(--danger-strong);
}

.danger-text-button:hover {
  background: var(--danger-bg);
}

.text-button {
  color: var(--accent);
}

.text-button:hover:not(:disabled) {
  background: var(--accent-bg-light);
}

.safe-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--success);
  font-size: var(--font-sm);
}

.safe-label svg {
  width: 17px;
  height: 17px;
}

.settings-tip {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  padding: 11px 13px;
  border-radius: 8px;
  background: var(--accent-bg-light);
  color: var(--text-secondary);
  font-size: var(--font-sm);
  line-height: 1.5;
}

.settings-tip svg {
  width: 17px;
  height: 17px;
  margin-top: 1px;
  color: var(--accent);
}

.keycap-group,
.row-actions {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 6px;
}

kbd {
  min-width: 28px;
  height: 26px;
  display: inline-grid;
  place-items: center;
  padding: 0 7px;
  border: 1px solid var(--border-input);
  border-bottom-width: 2px;
  border-radius: 6px;
  background: var(--bg-header);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: var(--font-xs);
}

.storage-path-copy {
  max-width: 350px;
}

.storage-path-copy small {
  overflow: hidden;
  color: var(--accent);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-note,
.inline-error {
  margin: 11px 2px 0;
  font-size: var(--font-sm);
}

.page-note {
  color: var(--text-tertiary);
}

.inline-error {
  color: var(--danger-strong);
}

.about-hero {
  gap: 15px;
  margin-bottom: 24px;
  padding: 6px 2px;
}

.about-logo {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border-radius: 15px;
  background: var(--accent);
  color: var(--accent-text-on);
  font-size: 28px;
  font-weight: 700;
}

.about-hero h3 {
  color: var(--text-primary);
  font-size: 20px;
}

.about-hero p {
  margin-top: 3px;
  color: var(--text-secondary);
  font-size: var(--font-sm);
}

.about-hero span {
  display: block;
  margin-top: 6px;
  color: var(--text-tertiary);
  font-size: var(--font-xs);
}

.update-progress-card {
  margin-top: 13px;
  padding: 13px 15px;
  border: 1px solid var(--border-subtle);
  border-radius: 9px;
}

.update-progress-card > div:first-child {
  display: flex;
  justify-content: space-between;
  color: var(--text-secondary);
  font-size: var(--font-sm);
}

.update-progress {
  height: 6px;
  overflow: hidden;
  margin-top: 10px;
  border-radius: 999px;
  background: var(--bg-header);
}

.update-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width var(--transition-normal);
}

.settings-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 24px;
  color: var(--text-tertiary);
  font-size: var(--font-xs);
}

.saving-indicator,
.saved-indicator {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.saving-indicator i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  animation: saving-pulse 1s ease-in-out infinite;
}

.saved-indicator {
  color: var(--success);
}

.saved-indicator svg {
  width: 15px;
  height: 15px;
}

.nested-overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--bg-overlay);
}

.storage-manager {
  width: min(560px, 100%);
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--bg-surface);
  box-shadow: var(--shadow-lg);
}

.storage-manager header {
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.storage-manager header h3 {
  color: var(--text-primary);
  font-size: var(--font-lg);
}

.storage-manager header p {
  margin-top: 4px;
  color: var(--text-tertiary);
  font-size: var(--font-xs);
}

.storage-manager-body {
  padding: 18px 20px 21px;
}

.storage-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 9px;
  margin-bottom: 14px;
}

.storage-metrics > div {
  min-height: 76px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 9px;
  background: var(--bg-chat);
}

.storage-metrics span,
.storage-metrics small {
  display: block;
}

.storage-metrics span {
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 600;
}

.storage-metrics small {
  margin-top: 5px;
  color: var(--text-tertiary);
  font-size: var(--font-xs);
}

@keyframes saving-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .settings-nav-item,
  .icon-button,
  .primary-button,
  .secondary-button,
  .danger-button,
  .danger-text-button,
  .text-button,
  .switch-control,
  .switch-control::after,
  .update-progress span {
    transition: none;
  }

  .saving-indicator i {
    animation: none;
  }
}

@media (max-width: 760px) {
  .settings-overlay {
    padding: 12px;
  }

  .settings-dialog {
    width: calc(100vw - 24px);
    height: calc(100vh - 24px);
    grid-template-columns: 176px minmax(0, 1fr);
  }

  .settings-page {
    padding-right: 18px;
    padding-left: 18px;
  }

  .setting-card-row,
  .shortcut-row {
    gap: 12px;
  }

  .storage-location-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
