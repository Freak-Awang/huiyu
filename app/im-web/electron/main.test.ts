import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  app: null as any, window: null as any, installing: false, requested: false,
  pendingUpdate: false, prepare: vi.fn(), install: vi.fn(), register: vi.fn(),
}))
vi.mock('./updater.js', () => ({
  isInstallingUpdate: () => mocks.installing,
  isUpdateInstallRequested: () => mocks.requested,
  shouldInstallOnQuit: () => mocks.pendingUpdate,
  installPendingUpdateOnQuit: mocks.install,
  registerUpdateHandlers: mocks.register,
}))
vi.mock('./p2pNative.js', () => ({ registerP2pHandlers: () => ({ suspendAll: mocks.prepare }) }))
vi.mock('./internalCertificateTrust.js', () => ({ configureInternalCertificateTrust: vi.fn() }))
vi.mock('./windowMode.js', () => ({ LOGIN_WINDOW_SIZE: { width: 400, height: 600 }, createWindowModeController: () => vi.fn() }))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  class Window extends EventEmitter {
    webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler: vi.fn(), send: vi.fn() })
    hide = vi.fn()
    loadFile = vi.fn()
    loadURL = vi.fn()
    constructor() { super(); mocks.window = this }
  }
  class Tray extends EventEmitter { setToolTip() {} setContextMenu() {} }
  mocks.app = Object.assign(new EventEmitter(), {
    whenReady: async () => undefined, setAppUserModelId: vi.fn(),
    requestSingleInstanceLock: () => true, quit: vi.fn(),
  })
  return {
    app: mocks.app, BrowserWindow: Window, Tray,
    Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
    Notification: {}, dialog: { showErrorBox: vi.fn() }, ipcMain: { handle: vi.fn() },
    nativeImage: { createFromPath: () => ({ isEmpty: () => true }) }, shell: {},
  }
})
function quitEvent() {
  const event = { preventDefault: vi.fn() }
  mocks.app.emit('before-quit', event)
  return event
}
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.app?.removeAllListeners()
  mocks.installing = mocks.requested = mocks.pendingUpdate = false
  mocks.prepare.mockResolvedValue(undefined)
  mocks.install.mockResolvedValue({ success: true })
  await import('./main.js')
  await vi.waitFor(() => expect(mocks.register).toHaveBeenCalled())
})
describe('application quit lifecycle', () => {
  it('normal close hides to tray but an updater close is allowed through', () => {
    const normal = { preventDefault: vi.fn() }
    mocks.window.emit('close', normal)
    expect(normal.preventDefault).toHaveBeenCalled()
    expect(mocks.window.hide).toHaveBeenCalledTimes(1)
    mocks.installing = true
    const updating = { preventDefault: vi.fn() }
    mocks.window.emit('close', updating)
    expect(updating.preventDefault).not.toHaveBeenCalled()
    expect(mocks.window.hide).toHaveBeenCalledTimes(1)
  })
  it('never blocks before-quit after updater installation starts', () => {
    mocks.installing = true
    expect(quitEvent().preventDefault).not.toHaveBeenCalled()
    expect(mocks.prepare).not.toHaveBeenCalled()
  })
  it('holds an ordinary quit while an explicit install is still preparing', () => {
    mocks.requested = true
    expect(quitEvent().preventDefault).toHaveBeenCalled()
    expect(mocks.install).not.toHaveBeenCalled()
  })
  it('saves transfers once before ordinary quit and does not call account logout', async () => {
    const event = quitEvent()
    quitEvent()
    expect(event.preventDefault).toHaveBeenCalled()
    await vi.waitFor(() => expect(mocks.app.quit).toHaveBeenCalledTimes(1))
    expect(mocks.prepare).toHaveBeenCalledTimes(1)
    expect(quitEvent().preventDefault).not.toHaveBeenCalled()
  })
  it('installs a downloaded update on ordinary quit after saving transfers', async () => {
    mocks.pendingUpdate = true
    quitEvent()
    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledTimes(1))
    expect(mocks.prepare).toHaveBeenCalledTimes(1)
    expect(mocks.app.quit).not.toHaveBeenCalled()
  })
})
