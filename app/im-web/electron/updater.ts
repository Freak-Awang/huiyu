/**
 * 保留内部更新 API / 灰度设备 ID / SHA256 与 RSA 协议，
 * 使用 electron-updater 6.8.9 管理下载、NSIS 静默安装和安装后启动。
 */
import { app, ipcMain, net } from 'electron'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import updater from 'electron-updater'
import type { AppUpdater, UpdateInfo } from 'electron-updater'
import type { ProviderRuntimeOptions } from 'electron-updater/out/providers/Provider.js'
import { resolveFiles } from 'electron-updater/out/providers/Provider.js'
import { createHash, randomUUID, verify as cryptoVerify, createPublicKey } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { configureInternalCertificateTrust } from './internalCertificateTrust.js'

const { NsisUpdater, Provider } = updater
export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'failed'
interface UpdateCheckResult {
  hasUpdate: boolean
  updateType: 'none' | 'incremental' | 'full' | 'force'
  targetVersion?: string
  targetBuild?: number
  changelog?: string[]
  downloadInfo?: {
    packageId: number; packageType: 'full' | 'patch'; url: string; size: number
    checksum: string; signature: string; fromVersion?: string; fileName: string
  }
}
export interface UpdateStateSnapshot {
  status: UpdateStatus
  updateType?: string; targetVersion?: string; changelog?: string[]
  received?: number; total?: number; fileName?: string; error?: string
}
interface UpdateInitPayload { serverOrigin: string; token: string; channel?: string }
const UPDATE_ERROR = '更新失败，请稍后重试。'
let getMainWindow: () => BrowserWindow | null = () => null
let guardSender: (event: IpcMainInvokeEvent) => void = () => undefined
let prepareToInstall: () => Promise<void> = async () => undefined
let trayProgressHook: ((text: string) => void) | undefined
let autoUpdater: InstanceType<typeof NsisUpdater> | undefined
let registered = false
let serverOrigin = ''
let authToken = ''
let channel = 'stable'
let deviceId = ''
let status: UpdateStatus = 'idle'
let pendingInfo: UpdateCheckResult | null = null
let downloadedFilePath: string | null = null
let lastError: string | undefined
let receivedBytes = 0
let totalBytes = 0
let installOnQuit = true
let updateInstallStarted = false
let installingUpdate = false
let checkPromise: Promise<UpdateStateSnapshot> | null = null
let firstCheckTimer: NodeJS.Timeout | undefined
let intervalTimer: NodeJS.Timeout | undefined
let activeRequest: AbortController | undefined
let cancelDownload: (() => void) | undefined
let generation = 0

async function ensureDeviceId() {
  if (deviceId) return
  const path = join(app.getPath('userData'), 'device-id.txt')
  try { deviceId = (await readFile(path, 'utf8')).trim() } catch { /* 首次运行 */ }
  if (deviceId) return
  deviceId = randomUUID()
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(path, deviceId, { encoding: 'utf8', mode: 0o600 })
}

function authorizedHeaders() {
  const parts = app.getVersion().split('.').map((part) => Number.parseInt(part, 10) || 0)
  return {
    Authorization: `Bearer ${authToken}`,
    'X-Client-Version': app.getVersion(),
    'X-Client-Build': String((parts[0] || 0) * 1_000_000 + (parts[1] || 0) * 1_000 + (parts[2] || 0)),
    'X-Device-ID': deviceId, 'X-Channel': channel, 'X-Support-Patch': 'false',
  }
}

function snapshot(): UpdateStateSnapshot {
  return { status, updateType: pendingInfo?.updateType, targetVersion: pendingInfo?.targetVersion,
    changelog: pendingInfo?.changelog ?? [], received: receivedBytes, total: totalBytes,
    fileName: pendingInfo?.downloadInfo?.fileName, error: lastError }
}
function broadcastState() {
  const window = getMainWindow()
  if (window && !window.isDestroyed()) window.webContents.send('update:state-changed', snapshot())
  trayProgressHook?.(status === 'downloading' && totalBytes > 0
    ? `ArtTalk - 正在下载更新 ${Math.floor(receivedBytes / totalBytes * 100)}%`
    : status === 'downloaded' ? 'ArtTalk - 更新完成，可重启安装' : 'ArtTalk')
}
function setStatus(next: UpdateStatus, error?: string) {
  status = next
  lastError = error
  broadcastState()
}
async function report(eventType: string) {
  if (!serverOrigin || !authToken) return
  try {
    await net.fetch(new URL('/api/v1/update/report', serverOrigin).href, {
      method: 'POST', headers: { ...authorizedHeaders(), 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000), redirect: 'error',
      body: JSON.stringify({ deviceId, currentVersion: app.getVersion(),
        targetVersion: pendingInfo?.targetVersion, eventType, channel }),
    })
  } catch { /* 遥测不阻塞客户端，不记录凭据或完整请求对象 */ }
}
async function verifyPackageSignature(checksum: string, signature?: string) {
  let pem: string
  try { pem = await readFile(join(app.getPath('userData'), 'update-public-key.pem'), 'utf8') }
  catch (error) {
    // 仅未配置公钥时使用 SHA256；公钥不可读/非法时不得降级放行。
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw new Error('更新公钥读取失败')
  }
  if (!signature?.startsWith('rsa:') || !cryptoVerify('RSA-SHA256',
    Buffer.from(checksum), createPublicKey(pem), Buffer.from(signature.slice(4), 'base64'))) {
    throw new Error('更新包签名验证失败')
  }
}

/** 适配现有 JSON API，不要求服务器增加 latest.yml 接口。 */
class InternalUpdateProvider extends Provider<UpdateInfo> {
  constructor(_options: unknown, _updater: AppUpdater, runtime: ProviderRuntimeOptions) { super(runtime) }
  async getLatestVersion(): Promise<UpdateInfo> {
    const requestGeneration = generation
    const controller = new AbortController()
    activeRequest = controller
    try {
      const response = await net.fetch(new URL('/api/v1/update/check', serverOrigin).href, {
        headers: authorizedHeaders(), redirect: 'error',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      })
      if (!response.ok) throw new Error('更新检查失败')
      const body = await response.json() as { code: number; data: UpdateCheckResult }
      if (requestGeneration !== generation) throw new Error('更新检查已取消')
      if (body.code !== 200 || !body.data) throw new Error('更新响应无效')
      const result = body.data
      if (!result.hasUpdate || !result.downloadInfo || result.downloadInfo.packageType !== 'full') {
        pendingInfo = null
        return { version: app.getVersion(), files: [], path: '', sha512: '', releaseDate: '' }
      }
      const info = result.downloadInfo
      const url = new URL(info.url, serverOrigin)
      const checksum = info.checksum.replace(/^sha256:/i, '').trim().toLowerCase()
      if (url.origin !== serverOrigin || url.username || url.password
        || !/^[a-f0-9]{64}$/.test(checksum) || !/^[^<>:"/\\|?*]+\.exe$/i.test(info.fileName)
        || !Number.isSafeInteger(info.size) || info.size <= 0 || !result.targetVersion) {
        throw new Error('更新包信息无效')
      }
      await verifyPackageSignature(checksum, info.signature)
      if (requestGeneration !== generation) throw new Error('更新检查已取消')
      pendingInfo = result
      // 6.8.9 的 Provider/HTTP 下载器支持 sha2（SHA256）旧协议。
      // 不伪造 SHA512；跨进程缓存没有 SHA512 时 updater 会重新下载并校验。
      return { version: result.targetVersion, files: [], path: info.fileName, sha2: checksum,
        releaseDate: '', releaseNotes: result.changelog?.join('\n') } as unknown as UpdateInfo
    } finally { if (activeRequest === controller) activeRequest = undefined }
  }
  resolveFiles(info: UpdateInfo) {
    const download = pendingInfo?.downloadInfo
    if (!download) throw new Error('没有更新包')
    return resolveFiles(info, new URL(serverOrigin), () => download.url)
  }
}

function getUpdater() {
  if (autoUpdater) return autoUpdater
  const instance = new NsisUpdater()
  instance.autoDownload = false
  // 退出自动安装由 main 保存传输进度后触发，保持原偏好且避免两个 quit 安装入口。
  instance.autoInstallOnAppQuit = false
  instance.disableDifferentialDownload = true
  instance.disableWebInstaller = true
  // 默认日志可能包含完整 HTTP 错误，改为只记录本模块的生命周期日志。
  instance.logger = null
  configureInternalCertificateTrust(instance.netSession)
  instance.netSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: new URL(details.url).origin !== serverOrigin })
  })
  instance.setFeedURL({ provider: 'custom', updateProvider: InternalUpdateProvider })
  instance.on('checking-for-update', () => { console.info('[Updater] checking'); setStatus('checking') })
  instance.on('update-available', () => { console.info('[Updater] update available'); setStatus('available') })
  instance.on('update-not-available', () => { pendingInfo = null; setStatus('idle') })
  instance.on('download-progress', (progress) => {
    receivedBytes = progress.transferred; totalBytes = progress.total; broadcastState()
  })
  instance.on('update-downloaded', (event) => {
    if (!pendingInfo?.downloadInfo) return
    downloadedFilePath = event.downloadedFile
    receivedBytes = totalBytes = pendingInfo?.downloadInfo?.size || 0
    console.info('[Updater] downloaded')
    setStatus('downloaded')
    void report('download_success')
  })
  instance.on('error', () => {
    if (!authToken && !installingUpdate) return
    console.warn('[Updater] update failed')
    if (!installingUpdate) setStatus('failed', UPDATE_ERROR)
    else { lastError = UPDATE_ERROR; broadcastState() }
  })
  autoUpdater = instance
  return instance
}
function checkForUpdates(): Promise<UpdateStateSnapshot> {
  if (!app.isPackaged || process.platform !== 'win32') {
    console.info('[Updater] check skipped in development or unsupported platform')
    return Promise.resolve(snapshot())
  }
  if (!serverOrigin || !authToken || updateInstallStarted || status === 'downloaded') return Promise.resolve(snapshot())
  if (checkPromise) return checkPromise
  const requestGeneration = generation
  checkPromise = (async () => {
    try {
      await ensureDeviceId()
      const instance = getUpdater()
      instance.requestHeaders = authorizedHeaders()
      const result = await instance.checkForUpdates()
      if (requestGeneration !== generation || !result?.isUpdateAvailable) return snapshot()
      console.info('[Updater] downloading')
      receivedBytes = 0; totalBytes = pendingInfo?.downloadInfo?.size || 0
      setStatus('downloading')
      cancelDownload = () => result.cancellationToken?.cancel()
      await instance.downloadUpdate(result.cancellationToken)
    } catch {
      if (requestGeneration === generation) { setStatus('failed', UPDATE_ERROR); void report('download_failed') }
    } finally { checkPromise = null; cancelDownload = undefined }
    return snapshot()
  })()
  return checkPromise
}
async function quitAndInstall() {
  if (!app.isPackaged || process.platform !== 'win32') {
    console.info('[Updater] quitAndInstall skipped in development mode')
    return { success: false, error: '开发环境不会安装正式更新。' }
  }
  if (updateInstallStarted) return { success: true }
  if (!downloadedFilePath || status !== 'downloaded' || !autoUpdater) return { success: false, error: '没有待安装的更新' }
  updateInstallStarted = true
  console.info('[Updater] install requested')
  setStatus('installing')
  let packageValidated = false
  try {
    // 不信任旧版 update-state.json；安装前重新检查磁盘文件，防止下载后的本地篡改。
    const info = pendingInfo!.downloadInfo!
    if ((await stat(downloadedFilePath)).size !== info.size) throw new Error('更新包大小不匹配')
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(downloadedFilePath)) hash.update(chunk)
    const checksum = info.checksum.replace(/^sha256:/i, '').trim().toLowerCase()
    if (hash.digest('hex') !== checksum) throw new Error('更新包校验失败')
    await verifyPackageSignature(checksum, info.signature)
    packageValidated = true
    await prepareToInstall()
    installingUpdate = true
    clearTimers()
    console.info('[Updater] quitting for update')
    autoUpdater.quitAndInstall(true, true)
    return { success: true }
  } catch {
    if (!installingUpdate) {
      updateInstallStarted = false
      if (!packageValidated) {
        await rm(downloadedFilePath, { force: true }).catch(() => undefined)
        downloadedFilePath = null
      }
      setStatus(packageValidated ? 'downloaded' : 'failed', UPDATE_ERROR)
    }
    else { lastError = UPDATE_ERROR; broadcastState() }
    void report('install_failed')
    return { success: false, error: UPDATE_ERROR }
  }
}
function clearTimers() {
  clearTimeout(firstCheckTimer); clearInterval(intervalTimer)
  firstCheckTimer = intervalTimer = undefined
}
async function initialize(payload: UpdateInitPayload) {
  if (!payload?.token) return { success: false, error: '更新初始化参数缺失' }
  try {
    const origin = new URL(payload.serverOrigin)
    if (origin.protocol !== 'https:' && !(origin.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))) throw new Error()
    if (serverOrigin && serverOrigin !== origin.origin) {
      stop()
      pendingInfo = null
      downloadedFilePath = null
      setStatus('idle')
    }
    serverOrigin = origin.origin
  } catch { return { success: false, error: '服务器地址非法' } }
  authToken = payload.token
  channel = payload.channel || 'stable'
  if (autoUpdater) autoUpdater.requestHeaders = authorizedHeaders()
  clearTimers()
  if (app.isPackaged && process.platform === 'win32') {
    firstCheckTimer = setTimeout(() => void checkForUpdates(), 10_000)
    intervalTimer = setInterval(() => void checkForUpdates(), 4 * 60 * 60 * 1000)
  }
  return { success: true }
}
function stop() {
  if (updateInstallStarted) return
  clearTimers()
  authToken = ''
  if (status !== 'downloaded') {
    generation++
    activeRequest?.abort()
    cancelDownload?.()
    pendingInfo = null
    downloadedFilePath = null
    setStatus('idle')
  }
  // 已下载更新属于应用，退出账号不删除它，也不改变退出安装偏好。
}
export function registerUpdateHandlers(deps: {
  getMainWindow: () => BrowserWindow | null
  assertSender: (event: IpcMainInvokeEvent) => void
  prepareToInstall: () => Promise<void>
  onTrayProgress?: (text: string) => void
}) {
  if (registered) return
  registered = true
  getMainWindow = deps.getMainWindow; guardSender = deps.assertSender
  prepareToInstall = deps.prepareToInstall; trayProgressHook = deps.onTrayProgress
  ipcMain.handle('update:init', (event, payload: UpdateInitPayload) => { guardSender(event); return initialize(payload) })
  ipcMain.handle('update:stop', (event) => { guardSender(event); stop(); return true })
  ipcMain.handle('update:check-now', (event) => { guardSender(event); return checkForUpdates() })
  ipcMain.handle('update:get-state', (event) => { guardSender(event); return snapshot() })
  ipcMain.handle('update:set-install-on-quit', (event, enabled: boolean) => {
    guardSender(event); installOnQuit = enabled === true; return true
  })
  ipcMain.handle('update:quit-and-install', (event) => { guardSender(event); return quitAndInstall() })
}
export function isInstallingUpdate() { return installingUpdate }
export function isUpdateInstallRequested() { return updateInstallStarted }
export function shouldInstallOnQuit() { return installOnQuit && status === 'downloaded' && !!downloadedFilePath }
export async function installPendingUpdateOnQuit() { return quitAndInstall() }
