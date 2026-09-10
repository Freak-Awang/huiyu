/**
 * 在线更新 Store：桥接 Electron 主进程更新模块与渲染进程 UI。
 *
 * 负责登录后初始化更新检测、监听主进程状态广播、维护"稍后提醒"会话级
 * 忽略状态，并向全局更新弹窗与设置页提供统一的更新状态与操作入口。
 * 仅在桌面端（Electron）环境生效，浏览器环境全部为空操作。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getServerOrigin } from '../config/runtime'

/** 更新状态快照（与主进程 UpdateStateSnapshot 对齐） */
export interface UpdateState {
  status: string
  updateType?: string
  targetVersion?: string
  changelog?: string[]
  received?: number
  total?: number
  fileName?: string
  error?: string
}

export const useUpdateStore = defineStore('update', () => {
  const status = ref('idle')
  const updateType = ref('')
  const targetVersion = ref('')
  const changelog = ref<string[]>([])
  const received = ref(0)
  const total = ref(0)
  const error = ref('')
  /** 会话级"稍后提醒"：用户关闭弹窗后本次运行不再自动弹出（强制更新除外） */
  const dismissed = ref(false)
  /** 用户是否勾选"退出时自动安装" */
  const installOnQuit = ref(true)
  /** 手动检查更新时强制展示弹窗 */
  const manualCheckVisible = ref(false)
  const installRequested = ref(false)
  const checking = ref(false)

  let initialized = false
  let unsubscribe: (() => void) | null = null

  const supported = computed(() => !!window.imDesktop?.initUpdate)
  const hasUpdate = computed(() => ['available', 'downloading', 'downloaded', 'installing'].includes(status.value))
  const isForce = computed(() => updateType.value === 'force' && hasUpdate.value)
  const progressPercent = computed(() => {
    if (!total.value || total.value <= 0) return 0
    return Math.min(100, Math.floor((received.value / total.value) * 100))
  })
  /** 是否应展示更新弹窗：强制更新始终展示；普通更新尊重"稍后提醒" */
  const dialogVisible = computed(() => {
    if (installRequested.value || status.value === 'installing') return true
    if (status.value === 'failed') return !dismissed.value
    if (!hasUpdate.value) return false
    if (isForce.value) return true
    if (manualCheckVisible.value) return true
    return !dismissed.value && status.value === 'downloaded'
  })

  function applyState(state: UpdateState) {
    status.value = state.status || 'idle'
    updateType.value = state.updateType || ''
    targetVersion.value = state.targetVersion || ''
    changelog.value = state.changelog || []
    received.value = state.received || 0
    total.value = state.total || 0
    error.value = state.error || ''
    // 新版本出现时重置"稍后提醒"状态
    if (state.status === 'available') {
      dismissed.value = false
    }
    if (state.status !== 'checking') {
      checking.value = false
    }
  }

  /** 登录成功后初始化更新检测（10 秒首次检测 + 每 4 小时轮询） */
  async function init(token: string) {
    if (!supported.value || !token) return
    const serverOrigin = getServerOrigin()
    if (!serverOrigin) return
    if (!unsubscribe && window.imDesktop?.onUpdateStateChanged) {
      unsubscribe = window.imDesktop.onUpdateStateChanged((state) => applyState(state))
    }
    const result = await window.imDesktop!.initUpdate!({ serverOrigin, token }).catch(() => ({ success: false }))
    if (!result.success) {
      applyState({ status: 'failed', error: '更新失败，请稍后重试。' })
      return
    }
    // 同步"退出时自动安装"偏好：主进程独立维护该开关，不推送会导致
    // 界面上已勾选、退出时却不安装
    await window.imDesktop?.setInstallOnQuit?.(installOnQuit.value)
    initialized = true
    // 恢复主进程已有状态（例如上次下载完成未安装）
    const state = await window.imDesktop!.getUpdateState!()
    applyState(state)
  }

  /** 登出时停止更新检测 */
  async function stop() {
    if (!initialized || !window.imDesktop?.stopUpdate) return
    await window.imDesktop.stopUpdate()
    initialized = false
    const state = await window.imDesktop.getUpdateState?.()
    if (state) applyState(state)
  }

  /** 手动检查更新（设置页"检查更新"按钮） */
  async function checkNow() {
    if (!supported.value || !window.imDesktop?.checkUpdateNow || checking.value || installRequested.value) return
    checking.value = true
    manualCheckVisible.value = true
    dismissed.value = false
    try {
      const state = await window.imDesktop.checkUpdateNow()
      applyState(state)
    } catch {
      applyState({ status: 'failed', error: '更新失败，请稍后重试。' })
    } finally {
      checking.value = false
    }
  }

  /** 立即重启并安装更新 */
  async function quitAndInstall() {
    if (!window.imDesktop?.quitAndInstallUpdate || installRequested.value || status.value !== 'downloaded') return
    installRequested.value = true
    error.value = ''
    try {
      const result = await window.imDesktop.quitAndInstallUpdate()
      if (!result.success) {
        const state = await window.imDesktop.getUpdateState?.()
        if (state) applyState(state)
        error.value = result.error || '更新失败，请稍后重试。'
        if (state?.status !== 'installing') installRequested.value = false
      }
    } catch {
      error.value = '更新失败，请稍后重试。'
      // IPC 断开可能表示正在退出；只在主进程确认尚未安装时开放重试。
      const state = await window.imDesktop.getUpdateState?.().catch(() => undefined)
      if (state && state.status !== 'installing') { applyState(state); installRequested.value = false }
    }
  }

  /** 切换"退出时自动安装" */
  async function toggleInstallOnQuit(enabled: boolean) {
    installOnQuit.value = enabled
    await window.imDesktop?.setInstallOnQuit?.(enabled)
  }

  /** 稍后只关闭提示；普通退出是否安装仍遵循现有复选框。 */
  function dismiss() {
    if (installRequested.value || status.value === 'installing') return
    dismissed.value = true
    manualCheckVisible.value = false
  }

  return {
    status, updateType, targetVersion, changelog, received, total, error,
    installOnQuit, checking, installRequested, supported, hasUpdate, isForce, progressPercent, dialogVisible,
    init, stop, checkNow, quitAndInstall, toggleInstallOnQuit, dismiss,
  }
})
