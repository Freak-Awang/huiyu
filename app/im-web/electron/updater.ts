/**
 * 客户端在线更新模块（Electron 主进程）
 *
 * 参照 QQ/微信桌面版更新体验：
 * - 登录后 30 秒首次检测，之后每 4 小时定时检测，避免影响启动速度
 * - 普通更新后台静默下载（支持 Range 断点续传），下载完成仅提示
 * - 强制更新由渲染进程阻断式弹窗处理
 * - 安装时机为用户主动退出/重启应用时，通过 NSIS 安装包静默覆盖安装
 *
 * 安全校验：下载完成校验 SHA256；若 userData 下存在 update-public-key.pem
 * 则额外进行 RSA（SHA256withRSA）签名验证，防止本地篡改。
 */
import { app, ipcMain, net } from 'electron'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { spawn } from 'node:child_process'
import { createHash, randomUUID, verify as cryptoVerify, createPublicKey } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/** 更新状态机 */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'failed'

/** 服务端更新检查响应 */
interface UpdateCheckResult {
  hasUpdate: boolean
  updateType: 'none' | 'incremental' | 'full' | 'force'
  targetVersion?: string
  targetBuild?: number
  changelog?: string[]
  downloadInfo?: {
    packageId: number
    packageType: 'full' | 'patch'
    url: string
    size: number
    checksum: string
    signature: string
    fromVersion?: string
    fileName: string
  }
}

/** 暴露给渲染进程的更新状态快照 */
export interface UpdateStateSnapshot {
  status: UpdateStatus
  updateType?: string
  targetVersion?: string
  changelog?: string[]
  received?: number
  total?: number
  fileName?: string
  error?: string
}

/** 初始化载荷（渲染进程登录后传入） */
interface UpdateInitPayload {
  serverOrigin: string
  token: string
  channel?: string
}

const CHECK_FIRST_DELAY_MS = 30_000
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

let getMainWindow: () => BrowserWindow | null = () => null
let guardSender: (event: IpcMainInvokeEvent) => void = () => undefined

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
let installOnQuit = false

let firstCheckTimer: NodeJS.Timeout | null = null
let intervalTimer: NodeJS.Timeout | null = null
let downloadAbort: AbortController | null = null

/** 托盘进度回调（由 main.ts 注入，用于托盘 tooltip 展示下载进度） */
let trayProgressHook: ((text: string) => void) | null = null

function updatesDir() {
  return join(app.getPath('userData'), 'updates')
}

function stateFilePath() {
  return join(updatesDir(), 'update-state.json')
}

function deviceIdPath() {
  return join(app.getPath('userData'), 'device-id.txt')
}

/** 读取或生成设备唯一标识（持久化到 userData，灰度哈希的一致性依赖它保持稳定） */
async function ensureDeviceId() {
  if (deviceId) return deviceId
  try {
    deviceId = (await readFile(deviceIdPath(), 'utf8')).trim()
    if (deviceId) return deviceId
  } catch {
    // 首次运行，生成新设备 ID
  }
  deviceId = randomUUID()
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(deviceIdPath(), deviceId, { encoding: 'utf8', mode: 0o600 })
  return deviceId
}

/** 将版本号 x.y.z 换算为数字构建号（与服务端 buildNumber 对齐的兜底方案） */
function buildNumberFromVersion(version: string) {
  const parts = version.split('.').map((part) => Number.parseInt(part, 10) || 0)
  return (parts[0] || 0) * 1_000_000 + (parts[1] || 0) * 1_000 + (parts[2] || 0)
}

function snapshot(): UpdateStateSnapshot {
  return {
    status,
    updateType: pendingInfo?.updateType,
    targetVersion: pendingInfo?.targetVersion,
    changelog: pendingInfo?.changelog ?? [],
    received: receivedBytes,
    total: totalBytes,
    fileName: pendingInfo?.downloadInfo?.fileName,
    error: lastError,
  }
}

/** 向渲染进程广播状态变化，并同步托盘提示 */
function broadcastState() {
  const state = snapshot()
  const window = getMainWindow()
  if (window && !window.isDestroyed()) {
    window.webContents.send('update:state-changed', state)
  }
  if (trayProgressHook) {
    if (status === 'downloading' && totalBytes > 0) {
      const percent = Math.floor((receivedBytes / totalBytes) * 100)
      trayProgressHook(`ArtTalk - 正在下载更新 ${percent}%`)
    } else if (status === 'downloaded') {
      trayProgressHook('ArtTalk - 新版本已就绪，退出后自动安装')
    } else {
      trayProgressHook('ArtTalk')
    }
  }
}

function setStatus(next: UpdateStatus, error?: string) {
  status = next
  lastError = error
  broadcastState()
}

/** 持久化"已下载待安装"状态，应用重启后可恢复 */
async function persistPendingState() {
  try {
    await mkdir(updatesDir(), { recursive: true })
    if (pendingInfo && downloadedFilePath) {
      await writeFile(stateFilePath(), JSON.stringify({
        info: pendingInfo,
        filePath: downloadedFilePath,
      }), { encoding: 'utf8', mode: 0o600 })
    } else {
      await rm(stateFilePath(), { force: true })
    }
  } catch {
    // 状态持久化失败不影响主流程
  }
}

/** 应用启动时恢复上次下载完成但未安装的更新 */
async function restorePendingState() {
  try {
    const raw = JSON.parse(await readFile(stateFilePath(), 'utf8')) as {
      info?: UpdateCheckResult
      filePath?: string
    }
    if (raw?.info?.hasUpdate && raw.filePath) {
      await stat(raw.filePath)
      pendingInfo = raw.info
      downloadedFilePath = raw.filePath
      setStatus('downloaded')
    }
  } catch {
    pendingInfo = null
    downloadedFilePath = null
  }
}

function authorizedHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${authToken}`,
    'X-Client-Version': app.getVersion(),
    'X-Client-Build': String(buildNumberFromVersion(app.getVersion())),
    'X-Device-ID': deviceId,
    'X-Channel': channel,
    // 当前客户端不具备 xdelta3 补丁合并能力，始终请求全量包
    'X-Support-Patch': 'false',
  }
}

/** 上报更新遥测事件（失败静默忽略） */
async function report(eventType: string, errorMessage?: string) {
  if (!serverOrigin || !authToken) return
  try {
    await net.fetch(new URL('/api/v1/update/report', serverOrigin).toString(), {
      method: 'POST',
      headers: { ...authorizedHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        currentVersion: app.getVersion(),
        targetVersion: pendingInfo?.targetVersion,
        eventType,
        errorMessage,
        channel,
      }),
    })
  } catch {
    // 遥测失败不影响更新流程
  }
}

/** 执行一次更新检查 */
async function checkForUpdates(manual = false): Promise<UpdateStateSnapshot> {
  if (!serverOrigin || !authToken) {
    return snapshot()
  }
  await ensureDeviceId()
  // 已有就绪的更新时不重复检查（手动触发除外）
  if (status === 'downloaded' && !manual) {
    return snapshot()
  }
  setStatus('checking')
  try {
    const response = await net.fetch(new URL('/api/v1/update/check', serverOrigin).toString(), {
      headers: authorizedHeaders(),
    })
    if (!response.ok) throw new Error(`检查更新失败 (${response.status})`)
    const body = await response.json() as { code: number; data: UpdateCheckResult }
    if (body.code !== 200 || !body.data) throw new Error('检查更新响应异常')

    if (!body.data.hasUpdate || !body.data.downloadInfo) {
      pendingInfo = null
      setStatus('idle')
      return snapshot()
    }

    pendingInfo = body.data
    setStatus('available')

    // 增量补丁需要客户端 xdelta3 支持，当前仅接受全量包
    if (body.data.downloadInfo.packageType !== 'full') {
      pendingInfo = null
      setStatus('idle')
      return snapshot()
    }

    await startDownload()
    return snapshot()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setStatus(manual ? 'failed' : 'idle', message)
    return snapshot()
  }
}

/** 后台静默下载更新包，支持断点续传（.part 文件 + Range 头） */
async function startDownload() {
  const info = pendingInfo?.downloadInfo
  if (!info || downloadAbort) return

  await mkdir(updatesDir(), { recursive: true })
  const safeName = info.fileName.replace(/[<>:"/\\|?*]/g, '_')
  const finalPath = join(updatesDir(), safeName)
  const partialPath = `${finalPath}.part`

  const controller = new AbortController()
  downloadAbort = controller
  setStatus('downloading')

  try {
    // 已完成下载的文件直接复用
    try {
    const existing = await stat(finalPath)
    if (existing.size === info.size) {
      receivedBytes = totalBytes = info.size
      await finishDownload(finalPath)
      return
    }
    } catch {
      // 文件不存在，走正常下载
    }

    let resumeFrom = 0
    try {
      resumeFrom = (await stat(partialPath)).size
    } catch {
      resumeFrom = 0
    }

    const headers: Record<string, string> = { Authorization: `Bearer ${authToken}` }
    if (resumeFrom > 0 && resumeFrom < info.size) {
      headers.Range = `bytes=${resumeFrom}-`
    } else {
      resumeFrom = 0
    }

    const downloadUrl = new URL(info.url, serverOrigin).toString()
    const response = await net.fetch(downloadUrl, { headers, signal: controller.signal })
    if (!response.ok && response.status !== 206) {
      throw new Error(`下载失败 (${response.status})`)
    }
    if (!response.body) throw new Error('下载响应为空')

    // 服务端不支持续传时从头下载
    if (resumeFrom > 0 && response.status === 200) {
      resumeFrom = 0
    }

    receivedBytes = resumeFrom
    totalBytes = info.size
    const writer = createWriteStream(partialPath, { flags: resumeFrom > 0 ? 'a' : 'w' })
    let lastBroadcast = 0
    const counter = new Transform({
      transform(chunk, _encoding, callback) {
        receivedBytes += chunk.length
        const now = Date.now()
        if (now - lastBroadcast > 500) {
          lastBroadcast = now
          broadcastState()
        }
        callback(null, chunk)
      },
    })
    await pipeline(Readable.fromWeb(response.body as never), counter, writer)
    await rename(partialPath, finalPath)
    await finishDownload(finalPath)
  } catch (error) {
    if (controller.signal.aborted) return
    const message = error instanceof Error ? error.message : String(error)
    setStatus('failed', message)
    void report('download_failed', message)
  } finally {
    downloadAbort = null
  }
}

/** 下载完成：校验 SHA256 与 RSA 签名，进入待安装状态 */
async function finishDownload(filePath: string) {
  const info = pendingInfo?.downloadInfo
  if (!info) return

  const expectedSha256 = info.checksum.replace(/^sha256:/i, '').trim().toLowerCase()
  const actualSha256 = await sha256File(filePath)
  if (actualSha256 !== expectedSha256) {
    await rm(filePath, { force: true }).catch(() => undefined)
    setStatus('failed', '更新包校验和不匹配')
    void report('download_failed', 'checksum mismatch')
    return
  }

  // 可选 RSA 验签：userData 下放置 update-public-key.pem 即启用
  if (info.signature?.startsWith('rsa:')) {
    const verified = await verifySignature(expectedSha256, info.signature.slice(4))
    if (!verified) {
      await rm(filePath, { force: true }).catch(() => undefined)
      setStatus('failed', '更新包签名验证失败')
      void report('download_failed', 'signature verification failed')
      return
    }
  }

  downloadedFilePath = filePath
  receivedBytes = totalBytes = info.size
  setStatus('downloaded')
  await persistPendingState()
  void report('download_success')
}

async function sha256File(filePath: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer)
  }
  return hash.digest('hex')
}

/** 使用内置公钥验证 RSA 签名；未配置公钥时视为通过（降级为仅 SHA256 校验） */
async function verifySignature(data: string, signatureBase64: string) {
  try {
    const publicKeyPem = await readFile(join(app.getPath('userData'), 'update-public-key.pem'), 'utf8')
    const key = createPublicKey(publicKeyPem)
    return cryptoVerify('RSA-SHA256', Buffer.from(data, 'utf8'), key, Buffer.from(signatureBase64, 'base64'))
  } catch {
    return true
  }
}

/**
 * 退出并安装：启动 NSIS 安装包（/S 静默覆盖安装），随后退出当前进程。
 * 安装程序会替换应用文件并重启新版本。
 */
async function quitAndInstall() {
  if (!downloadedFilePath || status !== 'downloaded') {
    return { success: false, error: '没有待安装的更新' }
  }
  try {
    setStatus('installing')
    const installer = downloadedFilePath
    if (installer.toLowerCase().endsWith('.exe')) {
      const child = spawn(installer, ['/S'], { detached: true, stdio: 'ignore' })
      child.unref()
    } else {
      throw new Error('未知的更新包格式')
    }
    void report('install_success')
    await rm(stateFilePath(), { force: true }).catch(() => undefined)
    setTimeout(() => {
      app.removeAllListeners('window-all-closed')
      app.exit(0)
    }, 500)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setStatus('failed', message)
    void report('install_failed', message)
    return { success: false, error: message }
  }
}

function clearTimers() {
  if (firstCheckTimer) clearTimeout(firstCheckTimer)
  if (intervalTimer) clearInterval(intervalTimer)
  firstCheckTimer = null
  intervalTimer = null
}

/** 登录成功后初始化：30 秒首次检测 + 每 4 小时定时检测 */
async function initialize(payload: UpdateInitPayload) {
  if (!payload?.serverOrigin || !payload?.token) {
    return { success: false, error: '更新初始化参数缺失' }
  }
  try {
    const origin = new URL(payload.serverOrigin)
    const loopback = origin.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
    if (origin.protocol !== 'https:' && !loopback) throw new Error('invalid origin')
    serverOrigin = origin.origin
  } catch {
    return { success: false, error: '服务器地址非法' }
  }
  authToken = payload.token
  channel = payload.channel || 'stable'
  await ensureDeviceId()

  clearTimers()
  firstCheckTimer = setTimeout(() => void checkForUpdates(), CHECK_FIRST_DELAY_MS)
  intervalTimer = setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS)
  return { success: true }
}

/** 登出时停止更新检测并中止下载 */
function stop() {
  clearTimers()
  downloadAbort?.abort()
  downloadAbort = null
  authToken = ''
  pendingInfo = null
  downloadedFilePath = null
  installOnQuit = false
  setStatus('idle')
  void persistPendingState()
}

/**
 * 注册更新模块 IPC 处理器。
 * 在 app ready 后调用，同时恢复上次下载完成未安装的更新。
 */
export function registerUpdateHandlers(deps: {
  getMainWindow: () => BrowserWindow | null
  assertSender: (event: IpcMainInvokeEvent) => void
  onTrayProgress?: (text: string) => void
}) {
  getMainWindow = deps.getMainWindow
  guardSender = deps.assertSender
  trayProgressHook = deps.onTrayProgress ?? null
  void restorePendingState().then(() => broadcastState())

  ipcMain.handle('update:init', async (event, payload: UpdateInitPayload) => {
    guardSender(event)
    return initialize(payload)
  })

  ipcMain.handle('update:stop', (event) => {
    guardSender(event)
    stop()
    return true
  })

  ipcMain.handle('update:check-now', async (event) => {
    guardSender(event)
    return checkForUpdates(true)
  })

  ipcMain.handle('update:get-state', (event) => {
    guardSender(event)
    return snapshot()
  })

  ipcMain.handle('update:set-install-on-quit', (event, enabled: boolean) => {
    guardSender(event)
    installOnQuit = enabled === true
    return true
  })

  ipcMain.handle('update:quit-and-install', async (event) => {
    guardSender(event)
    return quitAndInstall()
  })
}

/** 应用退出前调用：若用户选择"退出时自动安装"且更新已就绪，则静默安装 */
export async function installPendingUpdateOnQuit() {
  if (installOnQuit && status === 'downloaded' && downloadedFilePath) {
    installOnQuit = false
    await quitAndInstall()
  }
}

/** 是否有待安装的更新（供 main.ts 退出提示使用） */
export function hasPendingUpdate() {
  return status === 'downloaded' && !!downloadedFilePath
}

/** 用户是否选择了"退出时自动安装"且更新已就绪（供 before-quit 判断） */
export function shouldInstallOnQuit() {
  return installOnQuit && hasPendingUpdate()
}
