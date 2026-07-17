import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getServerOrigin } from '../config/runtime'
import type { DesktopUpdateState } from '../types/desktop'

const CHANNEL_KEY = 'arttalkUpdateChannel'

function defaultState(channel: 'stable' | 'beta'): DesktopUpdateState {
  return {
    status: 'idle',
    currentVersion: '',
    channel,
    transferBlockers: 0,
  }
}

export const useUpdateStore = defineStore('update', () => {
  const channel = ref<'stable' | 'beta'>(localStorage.getItem(CHANNEL_KEY) === 'beta' ? 'beta' : 'stable')
  const state = ref<DesktopUpdateState>(defaultState(channel.value))
  const initialized = ref(false)
  let removeListener: (() => void) | null = null

  const isDesktop = computed(() => !!window.imDesktop?.configureUpdater)
  const isBusy = computed(() => ['checking', 'downloading', 'installing'].includes(state.value.status))
  const needsAttention = computed(() =>
    ['available', 'downloaded', 'waiting-for-transfers', 'error'].includes(state.value.status),
  )

  async function initialize() {
    if (!isDesktop.value) return
    if (!removeListener && window.imDesktop?.onUpdateStateChanged) {
      removeListener = window.imDesktop.onUpdateStateChanged((next) => {
        state.value = next
      })
    }
    const serverOrigin = getServerOrigin()
    if (!serverOrigin) return
    state.value = await window.imDesktop!.configureUpdater!({
      serverOrigin,
      token: localStorage.getItem('token') || undefined,
      channel: channel.value,
    })
    initialized.value = true
  }

  async function check() {
    await initialize()
    if (window.imDesktop?.checkForUpdates) state.value = await window.imDesktop.checkForUpdates()
  }

  async function download() {
    if (window.imDesktop?.downloadUpdate) state.value = await window.imDesktop.downloadUpdate()
  }

  async function install() {
    if (window.imDesktop?.installUpdate) await window.imDesktop.installUpdate()
  }

  async function setChannel(value: 'stable' | 'beta') {
    channel.value = value
    localStorage.setItem(CHANNEL_KEY, value)
    await initialize()
    await check()
  }

  async function setTransferCount(count: number) {
    await window.imDesktop?.setUpdateTransferCount?.(Math.max(0, count))
  }

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

