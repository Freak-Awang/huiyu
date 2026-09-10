import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUpdateStore } from './update'
vi.mock('../config/runtime', () => ({ getServerOrigin: () => 'https://172.16.59.253:8443' }))

let desktop: any
let notify: (state: any) => void
beforeEach(() => {
  setActivePinia(createPinia())
  desktop = {
    initUpdate: vi.fn(async () => ({ success: true })),
    getUpdateState: vi.fn(async () => ({ status: 'downloaded', targetVersion: '0.0.16' })),
    onUpdateStateChanged: vi.fn((handler) => { notify = handler; return () => undefined }),
    setInstallOnQuit: vi.fn(), stopUpdate: vi.fn(),
    checkUpdateNow: vi.fn(async () => ({ status: 'downloaded', targetVersion: '0.0.16' })),
    quitAndInstallUpdate: vi.fn(async () => ({ success: true })),
  }
  vi.stubGlobal('window', { imDesktop: desktop })
})
describe('update UI', () => {
  it('manual check only downloads and prompts; later does not install', async () => {
    const store = useUpdateStore()
    await store.init('session')
    await store.checkNow()
    expect(store.dialogVisible).toBe(true)
    store.dismiss()
    expect(store.dialogVisible).toBe(false)
    expect(desktop.quitAndInstallUpdate).not.toHaveBeenCalled()
  })
  it('disables immediately, keeps the installing dialog visible and sends one install request', async () => {
    const store = useUpdateStore()
    await store.init('session')
    let resolve!: (value: any) => void
    desktop.quitAndInstallUpdate.mockReturnValue(new Promise((done) => { resolve = done }))
    const first = store.quitAndInstall()
    await store.quitAndInstall()
    expect(store.installRequested).toBe(true)
    expect(desktop.quitAndInstallUpdate).toHaveBeenCalledTimes(1)
    notify({ status: 'installing' })
    store.dismiss()
    expect(store.dialogVisible).toBe(true)
    resolve({ success: true })
    await first
    expect(store.installRequested).toBe(true)
  })
  it('restores the button after main rejects before installation', async () => {
    const store = useUpdateStore()
    await store.init('session')
    desktop.quitAndInstallUpdate.mockResolvedValue({ success: false, error: '更新失败，请稍后重试。' })
    await store.quitAndInstall()
    expect(store.installRequested).toBe(false)
    expect(store.status).toBe('downloaded')
    expect(store.error).toBe('更新失败，请稍后重试。')
  })
  it('shows a failed update and allows dismissing it without affecting auth', async () => {
    const store = useUpdateStore()
    await store.init('session')
    notify({ status: 'failed', error: '更新失败，请稍后重试。' })
    expect(store.dialogVisible).toBe(true)
    store.dismiss()
    expect(store.dialogVisible).toBe(false)
  })
  it('registers one listener across reinitialization and synchronizes the quit preference', async () => {
    const store = useUpdateStore()
    await store.init('first')
    await store.toggleInstallOnQuit(false)
    await store.init('rotated')
    expect(desktop.onUpdateStateChanged).toHaveBeenCalledTimes(1)
    expect(desktop.setInstallOnQuit).toHaveBeenLastCalledWith(false)
  })
})
