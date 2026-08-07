/**
 * 桌面端自动更新 Store：封装 Electron 更新状态管理，
 * 支持检查更新、下载、安装、切换更新通道及传输计数限制。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getServerOrigin } from '../config/runtime'
import type { DesktopUpdateState } from '../types/desktop'

/** 更新通道本地存储键 */
const CHANNEL_KEY = 'arttalkUpdateChannel'

function defaultState(channel: 'stable' | 'beta'): DesktopUpdateState {
  return {
    status: 'idle',
    currentVersion: '',
    channel,
    transferBlockers: 0,
  }
}

/**
 * 桌面端自动更新 Store：封装 Electron 更新流程状态管理。
 * state: channel - 更新通道；state - 更新状态；initialized - 是否已初始化
 */
export const useUpdateStore = defineStore('update', () => {
  /** 更新通道：stable 稳定版 / beta 测试版 */
  const channel = ref<'stable' | 'beta'>(localStorage.getItem(CHANNEL_KEY) === 'beta' ? 'beta' : 'stable')
  /** 当前更新状态 */
  const state = ref<DesktopUpdateState>(defaultState(channel.value))
  /** 是否已完成初始化 */
  const initialized = ref(false)
  /** 更新状态变更监听器的移除函数 */
  let removeListener: (() => void) | null = null

  const isDesktop = computed(() => !!window.imDesktop?.configureUpdater)
  const isBusy = computed(() => ['checking', 'downloading', 'installing'].includes(state.value.status))
  const needsAttention = computed(() =>
    ['available', 'downloaded', 'waiting-for-transfers', 'error'].includes(state.value.status),
  )

  function setOperationError(error: unknown) {
    state.value = {
      ...state.value,
      status: 'error',
      forceUpdate: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  /** 初始化更新器：注册状态监听并配置更新参数 */
  async function initialize() {
    if (!isDesktop.value) return
    if (!removeListener && window.imDesktop?.onUpdateStateChanged) {
      removeListener = window.imDesktop.onUpdateStateChanged((next) => {
        state.value = next
      })
    }
    const serverOrigin = getServerOrigin()
    if (!serverOrigin) return
    try {
      state.value = await window.imDesktop!.configureUpdater!({
        serverOrigin,
        token: localStorage.getItem('token') || undefined,
        channel: channel.value,
      })
      initialized.value = true
    } catch (error) {
      initialized.value = false
      setOperationError(error)
    }
  }

  /** 检查是否有可用更新 */
  async function check() {
    await initialize()
    if (!initialized.value) return
    try {
      if (window.imDesktop?.checkForUpdates) state.value = await window.imDesktop.checkForUpdates()
    } catch (error) { setOperationError(error) }
  }

  /** 下载更新包 */
  async function download() {
    try {
      if (window.imDesktop?.downloadUpdate) state.value = await window.imDesktop.downloadUpdate()
    } catch (error) { setOperationError(error) }
  }

  /** 安装更新并重启应用 */
  async function install() {
    try {
      if (window.imDesktop?.installUpdate) await window.imDesktop.installUpdate()
    } catch (error) { setOperationError(error) }
  }

  /**
   * 切换更新通道并重新检查更新。
   * @param value 目标通道
   */
  async function setChannel(value: 'stable' | 'beta') {
    channel.value = value
    localStorage.setItem(CHANNEL_KEY, value)
    await initialize()
    await check()
  }

  /**
   * 设置当前传输任务计数（用于更新前等待传输完成）。
   * @param count 传输中的任务数量
   */
  async function setTransferCount(count: number) {
    await window.imDesktop?.setUpdateTransferCount?.(Math.max(0, count))
  }

  /** 释放资源：移除更新状态监听器 */
  function dispose() {
    removeListener?.()
    removeListener = null
  }

  return {
    channel,
    state,
    initialized,
    isDesktop,
    isBusy,
    needsAttention,
    initialize,
    check,
    download,
    install,
    setChannel,
    setTransferCount,
    dispose,
  }
})
