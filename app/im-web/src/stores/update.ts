/**
 * 在线更新 Store：桥接 Electron 主进程更新模块与渲染进程 UI。
 *
 * 负责登录后初始化更新检测、监听主进程状态广播、维护"稍后提醒"会话级
 * 忽略状态，并向全局更新弹窗与设置页提供统一的更新状态与操作入口。
 * 仅在桌面端（Electron）环境生效，浏览器环境全部为空操作。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getServerOrigin, isDesktopRuntime } from '../config/runtime'

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
  const checking = ref(false)

  let initialized = false
  let unsubscribe: (() => void) | null = null

  const supported = computed(() => isDesktopRuntime() && !!window.imDesktop?.initUpdate)
  const hasUpdate = computed(() => ['available', 'downloading', 'downloaded'].includes(status.value))
  const isForce = computed(() => updateType.value === 'force' && hasUpdate.value)
  const progressPercent = computed(() => {
    if (!total.value || total.value <= 0) return 0
    return Math.min(100, Math.floor((received.value / total.value) * 100))
  })
  /** 是否应展示更新弹窗：强制更新始终展示；普通更新尊重"稍后提醒" */
  const dialogVisible = computed(() => {
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

  /** 登录成功后初始化更新检测（30 秒首次检测 + 每 4 小时轮询） */
  async function init(token: string) {
    if (!supported.value || !token) return
    const serverOrigin = getServerOrigin()
    if (!serverOrigin) return
    if (!unsubscribe && window.imDesktop?.onUpdateStateChanged) {
      unsubscribe = window.imDesktop.onUpdateStateChanged((state) => applyState(state))
    }
    await window.imDesktop!.initUpdate!({ serverOrigin, token })
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
    applyState({ status: 'idle' })
  }

  /** 手动检查更新（设置页"检查更新"按钮） */
  async function checkNow() {
    if (!supported.value || !window.imDesktop?.checkUpdateNow) return
    checking.value = true
    manualCheckVisible.value = true
    try {
      const state = await window.imDesktop.checkUpdateNow()
      applyState(state)
    } finally {
      checking.value = false
    }
  }

  /** 立即重启并安装更新 */
  async function quitAndInstall() {
    if (!window.imDesktop?.quitAndInstallUpdate) return
    await window.imDesktop.quitAndInstallUpdate()
  }

  /** 切换"退出时自动安装" */
  async function toggleInstallOnQuit(enabled: boolean) {
    installOnQuit.value = enabled
    await window.imDesktop?.setInstallOnQuit?.(enabled)
  }

  /** 关闭弹窗（稍后提醒）：普通更新本次运行不再自动弹出 */
  function dismiss() {
    dismissed.value = true
    manualCheckVisible.value = false
  }

  return {
    status, updateType, targetVersion, changelog, received, total, error,
    installOnQuit, checking, supported, hasUpdate, isForce, progressPercent, dialogVisible,
    init, stop, checkNow, quitAndInstall, toggleInstallOnQuit, dismiss,
  }
})
