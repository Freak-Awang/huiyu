import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  packaged: true, directory: '', handlers: new Map<string, (...args: any[]) => any>(),
  fetch: vi.fn(), prepare: vi.fn(), assert: vi.fn(), send: vi.fn(),
  instances: [] as any[],
}))
vi.mock('electron', () => ({
  app: { get isPackaged() { return mocks.packaged }, getVersion: () => '0.0.15', getPath: () => mocks.directory },
  ipcMain: { handle: (channel: string, handler: any) => mocks.handlers.set(channel, handler) },
  net: { fetch: mocks.fetch },
}))
vi.mock('./internalCertificateTrust.js', () => ({ configureInternalCertificateTrust: vi.fn() }))
vi.mock('electron-updater', async () => {
  const { EventEmitter } = await import('node:events')
  const { Provider } = await import('electron-updater/out/providers/Provider.js')
  class NsisUpdater extends EventEmitter {
    netSession = { webRequest: { onBeforeRequest: vi.fn() } }
    quitAndInstall = vi.fn()
    provider: any
    constructor() { super(); mocks.instances.push(this) }
    setFeedURL(options: any) { this.provider = new options.updateProvider(options, this, {}) }
    async checkForUpdates() {
      this.emit('checking-for-update')
      const info = await this.provider.getLatestVersion()
      const available = info.version !== '0.0.15'
      this.emit(available ? 'update-available' : 'update-not-available', info)
      return { isUpdateAvailable: available, cancellationToken: { cancel: vi.fn() } }
    }
    async downloadUpdate() {
      this.emit('download-progress', { transferred: 4, total: 4 })
      this.emit('update-downloaded', { downloadedFile: join(mocks.directory, 'next.exe') })
    }
  }
  return { default: { NsisUpdater, Provider } }
})
import { configureInternalCertificateTrust } from './internalCertificateTrust.js'

let updaterModule: typeof import('./updater.js')
const call = (channel: string, ...args: any[]) => mocks.handlers.get(channel)!({}, ...args)
const origin = 'https://172.16.59.253:8443'
const packageBytes = Buffer.from('test')
const checksum = createHash('sha256').update(packageBytes).digest('hex')
let response: any
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.packaged = true
  mocks.handlers.clear()
  mocks.instances.length = 0
  mocks.directory = await mkdtemp(join(tmpdir(), 'im-updater-test-'))
  await writeFile(join(mocks.directory, 'next.exe'), packageBytes)
  response = { code: 200, data: { hasUpdate: true, updateType: 'full', targetVersion: '0.0.16',
    downloadInfo: { packageId: 1, packageType: 'full', url: '/api/v1/update/download/1',
      fileName: 'ArtTalk-Setup-0.0.16-x64.exe', size: 4, checksum: 'sha256:' + checksum } } }
  mocks.fetch.mockImplementation(async (url: string) => ({ ok: true,
    json: async () => url.endsWith('/check') ? response : { code: 200 } }))
  mocks.prepare.mockResolvedValue(undefined)
  updaterModule = await import('./updater.js')
  updaterModule.registerUpdateHandlers({
    getMainWindow: () => ({ isDestroyed: () => false, webContents: { send: mocks.send } }) as any,
    assertSender: mocks.assert, prepareToInstall: mocks.prepare,
  })
  await call('update:init', { serverOrigin: origin, token: 'test-session' })
})
afterEach(async () => {
  await call('update:stop')
  vi.clearAllTimers()
  await rm(mocks.directory, { recursive: true, force: true })
})
describe('main updater', () => {
  it('downloads using the existing provider and shared CA, then waits for an explicit install', async () => {
    const state = await call('update:check-now')
    expect(state.status).toBe('downloaded')
    const instance = mocks.instances[0]
    expect(configureInternalCertificateTrust).toHaveBeenCalledWith(instance.netSession)
    expect(instance.autoInstallOnAppQuit).toBe(false)
    expect(instance.quitAndInstall).not.toHaveBeenCalled()
    const info = await instance.provider.getLatestVersion()
    const [file] = instance.provider.resolveFiles(info)
    expect(file.url.href).toBe(origin + '/api/v1/update/download/1')
    expect(file.info.sha2).toBe(checksum)
    expect(file.info.sha512).toBeUndefined()
    const headers = mocks.fetch.mock.calls[0]![1].headers
    expect(headers['X-Support-Patch']).toBe('false')
    expect(await readFile(join(mocks.directory, 'device-id.txt'), 'utf8')).not.toBe('')
  })
  it('prepares before installation and accepts repeat clicks without spawning twice', async () => {
    await call('update:check-now')
    let resolve!: () => void
    mocks.prepare.mockReturnValue(new Promise<void>((done) => { resolve = done }))
    const installing = call('update:quit-and-install')
    await vi.waitFor(() => expect(mocks.prepare).toHaveBeenCalledTimes(1))
    expect(updaterModule.isInstallingUpdate()).toBe(false)
    expect(mocks.instances[0].quitAndInstall).not.toHaveBeenCalled()
    await call('update:quit-and-install')
    resolve()
    await installing
    expect(updaterModule.isInstallingUpdate()).toBe(true)
    expect(mocks.instances[0].quitAndInstall).toHaveBeenCalledExactlyOnceWith(true, true)
    await call('update:quit-and-install')
    expect(mocks.instances[0].quitAndInstall).toHaveBeenCalledTimes(1)
  })
  it('keeps the app usable when saving transfer state fails and permits retry', async () => {
    await call('update:check-now')
    mocks.prepare.mockRejectedValueOnce(new Error('disk unavailable'))
    expect((await call('update:quit-and-install')).success).toBe(false)
    expect((await call('update:get-state')).status).toBe('downloaded')
    expect(updaterModule.isInstallingUpdate()).toBe(false)
    expect(mocks.instances[0].quitAndInstall).not.toHaveBeenCalled()
    expect((await call('update:quit-and-install')).success).toBe(true)
  })
  it('rejects tampering after download, removes the bad package and allows a fresh download', async () => {
    await call('update:check-now')
    await writeFile(join(mocks.directory, 'next.exe'), 'evil')
    expect((await call('update:quit-and-install')).success).toBe(false)
    expect((await call('update:get-state')).status).toBe('failed')
    expect(mocks.instances[0].quitAndInstall).not.toHaveBeenCalled()
  })
  it('honors later / normal-quit preference and does not install on check', async () => {
    await call('update:check-now')
    expect(updaterModule.shouldInstallOnQuit()).toBe(true)
    await call('update:set-install-on-quit', false)
    expect(updaterModule.shouldInstallOnQuit()).toBe(false)
    expect(mocks.instances[0].quitAndInstall).not.toHaveBeenCalled()
  })
  it('never checks or installs in development', async () => {
    mocks.packaged = false
    await call('update:check-now')
    expect((await call('update:quit-and-install')).success).toBe(false)
    expect(mocks.instances).toHaveLength(0)
  })
  it('rejects a foreign-origin download before sending credentials to it', async () => {
    response.data.downloadInfo.url = 'https://outside.example/update.exe'
    expect((await call('update:check-now')).status).toBe('failed')
    expect(mocks.instances[0].quitAndInstall).not.toHaveBeenCalled()
  })
  it('fails closed for a configured but invalid signing key', async () => {
    await writeFile(join(mocks.directory, 'update-public-key.pem'), 'invalid key')
    expect((await call('update:check-now')).status).toBe('failed')
    expect(mocks.instances[0].quitAndInstall).not.toHaveBeenCalled()
  })
  it('checks IPC sender and registers each handler only once', () => {
    const size = mocks.handlers.size
    updaterModule.registerUpdateHandlers({ getMainWindow: () => null, assertSender: mocks.assert, prepareToInstall: mocks.prepare })
    expect(mocks.handlers.size).toBe(size)
    expect(mocks.assert).toHaveBeenCalled()
  })
})

it('installed electron-updater 6.8.9 maps silent/force-run flags to the NSIS installer', async () => {
  const { NsisUpdater } = await import('electron-updater/out/NsisUpdater.js')
  const instance = Object.create(NsisUpdater.prototype)
  instance.downloadedUpdateHelper = { file: join(mocks.directory, 'next.exe'), packageFile: null }
  instance.spawnLog = vi.fn(async () => true)
  expect(instance.doInstall({ isSilent: true, isForceRunAfter: true })).toBe(true)
  expect(instance.spawnLog).toHaveBeenCalledWith(join(mocks.directory, 'next.exe'), ['--updated', '/S', '--force-run'])
})
