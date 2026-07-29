/**
 * 自动更新模块（Electron 主进程）
 *
 * 管理应用自动更新全流程：策略检查 -> 版本比对 -> 下载 -> 安装。
 * 支持 stable/beta 双通道、强制更新、传输任务阻塞安装、离线缓存策略回退。
 * 通过 electron-updater 的 generic provider 从服务端获取更新包。
 */
import electronUpdater from 'electron-updater'
import { app, BrowserWindow, ipcMain, net, powerMonitor } from 'electron'
import type { WebContents } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'

const { autoUpdater } = electronUpdater

/** 更新状态枚举 */
export type UpdateStatus =
  | 'idle'              // 空闲，未开始检查
  | 'checking'          // 正在检查更新
  | 'available'         // 发现可用更新
  | 'not-available'     // 当前已是最新版本
  | 'downloading'       // 正在下载更新包
  | 'downloaded'        // 更新包已下载完成
  | 'waiting-for-transfers' // 等待传输任务完成后再安装
  | 'installing'        // 正在安装
  | 'error'             // 出错

/** 当前更新状态快照 */
export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  targetVersion?: string
  releaseName?: string
  releaseNotes?: string[]
  releaseDate?: string
  forceUpdate?: boolean       // 强制更新：发现新版本后自动开始下载
  percent?: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
  error?: string
  lastCheckedAt?: string
  channel: 'stable' | 'beta'
  transferBlockers: number    // 当前阻止安装的传输任务数
}

/** 服务端返回的更新策略 */
interface UpdatePolicy {
  hasUpdate: boolean
  latestVersion?: string
  minimumSupportedVersion?: string
  forceUpdate?: boolean
  releaseName?: string
  releaseNotes?: string[]
  publishedAt?: string
  updateBaseUrl?: string
  channel?: 'stable' | 'beta'
}

/** 渲染进程传入的更新器配置 */
interface UpdaterConfiguration {
  serverOrigin: string
  token?: string
  channel?: 'stable' | 'beta'
}

/** 待安装标记：记录即将安装的版本信息，用于重启后上报安装成功 */
interface PendingInstallMarker {
  targetVersion: string
  serverOrigin: string
  channel: 'stable' | 'beta'
}

/** 缓存的更新策略，用于离线回退 */
interface CachedPolicy {
  serverOrigin: string
  channel: 'stable' | 'beta'
  savedAt: string
  policy: UpdatePolicy
}

/** 更新器外部依赖注入 */
interface UpdaterDependencies {
  getMainWindow: () => BrowserWindow | null
  getNativeTransferCount: () => number
  beforeInstall: () => void
}

/** 定时检查间隔：6小时 */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

/** 首次检查延迟：5-20秒内随机，避免多客户端同时请求 */
const INITIAL_CHECK_MIN_MS = 5_000
const INITIAL_CHECK_SPREAD_MS = 15_000

let dependencies: UpdaterDependencies | null = null
let configuration: Required<Pick<UpdaterConfiguration, 'serverOrigin' | 'channel'>> & { token?: string } | null = null

/** 渲染进程报告的传输任务数 */
let rendererTransferCount = 0

let periodicTimer: ReturnType<typeof setInterval> | null = null
let initialTimer: ReturnType<typeof setTimeout> | null = null

/** 标记：当传输任务清零后自动安装 */
let installWhenReady = false

/** 防止重复检查的互斥锁 */
let checking = false

let initialized = false

let state: UpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  channel: 'stable',
  transferBlockers: 0,
}

function deviceIdPath() {
  return join(app.getPath('userData'), 'update-device-id')
}

function pendingInstallPath() {
  return join(app.getPath('userData'), 'pending-update.json')
}

function cachedPolicyPath() {
  return join(app.getPath('userData'), 'cached-update-policy.json')
}

/**
 * 获取或创建设备唯一标识
 * 首次运行时生成 UUID 并持久化，用于服务端灰度发布和设备级更新统计
 */
async function getDeviceId() {
  const path = deviceIdPath()
  try {
    const existing = (await readFile(path, 'utf8')).trim()
    if (/^[0-9a-f-]{36}$/i.test(existing)) return existing
  } catch {
    // 首次运行：生成安装域唯一标识
  }
  const id = randomUUID()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, id, { encoding: 'utf8', mode: 0o600 })
  return id
}

/** 计算总的传输阻塞数 = 渲染进程传输 + 原生下载任务 */
function totalTransferBlockers() {
  return Math.max(0, rendererTransferCount) + Math.max(0, dependencies?.getNativeTransferCount() || 0)
}

/**
 * 更新状态并通知渲染进程
 * 自动填充 currentVersion、channel、transferBlockers
 */
function setState(patch: Partial<UpdateState>) {
  state = {
    ...state,
    ...patch,
    currentVersion: app.getVersion(),
    channel: configuration?.channel || state.channel,
    transferBlockers: totalTransferBlockers(),
  }
  const window = dependencies?.getMainWindow()
  if (window && !window.isDestroyed()) {
    window.webContents.send('updater:state-changed', state)
  }
}

/** 构建请求头，携带认证 token */
function updaterHeaders() {
  return configuration?.token ? { Authorization: `Bearer ${configuration.token}` } : undefined
}

/**
 * 向服务端上报更新事件（用于监控和统计分析）
 * @param eventType - 事件类型：CHECKED / DOWNLOAD_STARTED / UPDATE_AVAILABLE 等
 * @param errorMessage - 可选的错误信息
 */
async function postEvent(eventType: string, errorMessage?: string) {
  if (!configuration?.serverOrigin) return false
  const payload = {
    deviceId: await getDeviceId(),
    currentVersion: app.getVersion(),
    targetVersion: state.targetVersion,
    eventType,
    errorMessage: errorMessage?.slice(0, 1000),
    platform: process.platform,
    arch: process.arch,
    channel: configuration.channel,
  }
  try {
    const response = await net.fetch(`${configuration.serverOrigin}/api/client/update-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...updaterHeaders() },
      body: JSON.stringify(payload),
    })
    return response.ok
  } catch (error) {
    console.warn('更新事件上报失败:', error)
    return false
  }
}

/**
 * 请求服务端更新策略
 * 携带平台、架构、当前版本、设备ID等参数，服务端据此决定是否推送更新
 * 成功后将策略缓存到本地，供离线回退使用
 */
async function requestPolicy(): Promise<UpdatePolicy> {
  if (!configuration) throw new Error('更新服务器未配置')
  const url = new URL('/api/client/releases/policy', configuration.serverOrigin)
  url.searchParams.set('platform', process.platform)
  url.searchParams.set('arch', process.arch)
  url.searchParams.set('channel', configuration.channel)
  url.searchParams.set('currentVersion', app.getVersion())
  url.searchParams.set('deviceId', await getDeviceId())
  const response = await net.fetch(url.toString(), { headers: updaterHeaders() })
  if (!response.ok) throw new Error(`更新策略请求失败 (${response.status})`)
  const body = await response.json() as { code?: number; message?: string; data?: UpdatePolicy; hasUpdate?: boolean }
  if ('code' in body && body.code !== 200) throw new Error(body.message || '更新策略请求失败')
  const policy = (body.data || body) as UpdatePolicy
  const cached: CachedPolicy = {
    serverOrigin: configuration.serverOrigin,
    channel: configuration.channel,
    savedAt: new Date().toISOString(),
    policy,
  }
  await writeFile(cachedPolicyPath(), JSON.stringify(cached), { encoding: 'utf8', mode: 0o600 }).catch(() => undefined)
  return policy
}

/**
 * 加载本地缓存的强制更新策略
 * 仅在当前配置匹配、缓存未过期（24小时内）、且为强制更新时返回
 * 用于策略服务不可用时的离线回退
 */
async function loadCachedForcePolicy() {
  if (!configuration) return null
  try {
    const cached = JSON.parse(await readFile(cachedPolicyPath(), 'utf8')) as CachedPolicy
    const age = Date.now() - new Date(cached.savedAt).getTime()
    if (cached.serverOrigin !== configuration.serverOrigin || cached.channel !== configuration.channel
        || age < 0 || age > 24 * 60 * 60 * 1000 || !cached.policy.hasUpdate || !cached.policy.forceUpdate) return null
    return cached.policy
  } catch {
    return null
  }
}

/** 判断 URL 是否为本地回环地址 */
function isLoopbackUrl(url: URL) {
  return url.protocol === 'http:'
    && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}

/**
 * 配置 electron-updater 的更新源
 * 仅允许 HTTPS 或本地回环地址，配置后禁止降级安装
 */
function configureFeed(policy: UpdatePolicy) {
  if (!policy.updateBaseUrl) throw new Error('更新策略未提供更新源地址')
  const source = new URL(policy.updateBaseUrl)
  if (source.protocol !== 'https:' && !isLoopbackUrl(source)) throw new Error('更新源必须使用 HTTPS')
  autoUpdater.setFeedURL({ provider: 'generic', url: source.toString() })
  autoUpdater.channel = configuration?.channel === 'beta' ? 'beta' : 'latest'
  // electron-updater 设置 channel 时会自动启用降级，需要手动关闭
  autoUpdater.allowDowngrade = false
}

/**
 * 检查更新
 * 流程：请求策略 -> 比对版本 -> 有更新则配置 electron-updater feed -> 触发下载检查
 * 仅在打包版本中执行（开发模式跳过），且不重复检查
 * @param manual - 是否手动触发（手动触发时开发模式返回 not-available）
 */
export async function checkForUpdates(manual = false) {
  if (!app.isPackaged) {
    if (manual) setState({ status: 'not-available', lastCheckedAt: new Date().toISOString(), error: undefined })
    return state
  }
  if (!configuration || checking || state.status === 'downloading' || state.status === 'installing') return state
  checking = true
  setState({ status: 'checking', error: undefined })
  try {
    const policy = await requestPolicy()
    setState({
      targetVersion: policy.latestVersion,
      releaseName: policy.releaseName,
      releaseNotes: policy.releaseNotes,
      releaseDate: policy.publishedAt,
      forceUpdate: !!policy.forceUpdate,
      lastCheckedAt: new Date().toISOString(),
    })
    await postEvent('CHECKED')
    if (!policy.hasUpdate) {
      setState({ status: 'not-available', targetVersion: undefined, forceUpdate: false })
      return state
    }
    configureFeed(policy)
    await autoUpdater.checkForUpdates()
    return state
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // 策略服务不可用时，尝试使用本地缓存的强制更新策略回退
    const cachedPolicy = await loadCachedForcePolicy()
    if (cachedPolicy) {
      setState({
        targetVersion: cachedPolicy.latestVersion,
        releaseName: cachedPolicy.releaseName,
        releaseNotes: cachedPolicy.releaseNotes,
        releaseDate: cachedPolicy.publishedAt,
        forceUpdate: true,
        error: '策略服务暂时不可用，正在使用最近一次有效的强制更新策略。',
      })
      configureFeed(cachedPolicy)
      try {
        await autoUpdater.checkForUpdates()
      } catch (cachedError) {
        const cachedMessage = cachedError instanceof Error ? cachedError.message : String(cachedError)
        setState({ status: 'error', error: cachedMessage })
        await postEvent('CHECK_FAILED', cachedMessage)
      }
      return state
    }
    setState({ status: 'error', error: message })
    await postEvent('CHECK_FAILED', message)
    return state
  } finally {
    checking = false
  }
}

/** 下载已发现的更新包 */
export async function downloadUpdate() {
  if (state.status !== 'available' && state.status !== 'error') return state
  setState({ status: 'downloading', error: undefined, percent: 0 })
  await postEvent('DOWNLOAD_STARTED')
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setState({ status: 'error', error: message })
    await postEvent('DOWNLOAD_FAILED', message)
  }
  return state
}

/** 写入待安装标记，用于重启后上报安装成功 */
async function writePendingInstallMarker() {
  if (!configuration || !state.targetVersion) return
  const marker: PendingInstallMarker = {
    targetVersion: state.targetVersion,
    serverOrigin: configuration.serverOrigin,
    channel: configuration.channel,
  }
  await writeFile(pendingInstallPath(), JSON.stringify(marker), { encoding: 'utf8', mode: 0o600 })
}

/**
 * 安装已下载的更新
 * 若有传输任务正在执行，则进入 waiting-for-transfers 状态等待
 * 待所有传输完成后自动调用 quitAndInstall 重启安装
 */
export async function installUpdate() {
  if (state.status !== 'downloaded' && state.status !== 'waiting-for-transfers') return false
  if (totalTransferBlockers() > 0) {
    installWhenReady = true
    setState({ status: 'waiting-for-transfers' })
    return false
  }
  installWhenReady = false
  setState({ status: 'installing' })
  await postEvent('INSTALL_REQUESTED')
  await writePendingInstallMarker()
  dependencies?.beforeInstall()
  autoUpdater.quitAndInstall(false, true)
  return true
}

/**
 * 启动后上报安装成功
 * 读取 pending-update.json，若当前版本与标记的目标版本一致则上报 VERSION_STARTED 事件
 */
async function reportSuccessfulStart() {
  try {
    const marker = JSON.parse(await readFile(pendingInstallPath(), 'utf8')) as PendingInstallMarker
    if (marker.targetVersion !== app.getVersion()) return
    const priorConfiguration = configuration
    configuration = {
      serverOrigin: marker.serverOrigin,
      channel: marker.channel,
      token: priorConfiguration?.token,
    }
    state.targetVersion = marker.targetVersion
    if (await postEvent('VERSION_STARTED')) {
      await rm(pendingInstallPath(), { force: true })
    }
    configuration = priorConfiguration
  } catch {
    // 无待安装标记，说明是正常启动
  }
}

/**
 * 调度定时检查
 * 首次检查：启动后 5-20 秒内随机触发（避免多客户端同时请求）
 * 后续检查：每 6 小时一次
 */
function scheduleChecks() {
  if (!app.isPackaged || !configuration) return
  if (initialTimer) clearTimeout(initialTimer)
  if (periodicTimer) clearInterval(periodicTimer)
  initialTimer = setTimeout(
    () => void checkForUpdates(),
    INITIAL_CHECK_MIN_MS + Math.floor(Math.random() * INITIAL_CHECK_SPREAD_MS),
  )
  periodicTimer = setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS)
}

/**
 * 注册 electron-updater 事件监听
 * - 禁止自动下载：由渲染进程用户确认后手动触发
 * - 自动安装退出：应用退出时自动安装已下载的更新
 * - 强制更新：发现新版本后自动开始下载
 */
function registerUpdaterEvents() {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false

  autoUpdater.on('checking-for-update', () => setState({ status: 'checking', error: undefined }))
  autoUpdater.on('update-available', (info) => {
    setState({
      status: 'available',
      targetVersion: info.version,
      releaseDate: info.releaseDate || state.releaseDate,
    })
    void postEvent('UPDATE_AVAILABLE')
    if (state.forceUpdate) void downloadUpdate() // 强制更新：发现新版本即自动下载
  })
  autoUpdater.on('update-not-available', () => {
    setState({ status: 'not-available', lastCheckedAt: new Date().toISOString() })
  })
  autoUpdater.on('download-progress', (progress) => {
    setState({
      status: 'downloading',
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    setState({ status: 'downloaded', targetVersion: info.version, percent: 100 })
    void postEvent('DOWNLOAD_SUCCEEDED')
  })
  autoUpdater.on('error', (error) => {
    setState({ status: 'error', error: error.message })
    void postEvent('DOWNLOAD_FAILED', error.message)
  })
}

/**
 * 注册更新器 IPC 处理器
 * 所有接口均校验请求来源为主窗口，确保安全性
 */
function registerUpdaterIpc() {
  const assertTrustedSender = (sender: WebContents) => {
    const mainWindow = dependencies?.getMainWindow()
    if (!mainWindow || sender !== mainWindow.webContents) {
      throw new Error('更新器 IPC 请求并非来自主应用窗口')
    }
  }
  /** 配置更新服务器地址和通道 */
  ipcMain.handle('updater:configure', async (event, value: UpdaterConfiguration) => {
    assertTrustedSender(event.sender)
    const url = new URL(value.serverOrigin)
    if (url.protocol !== 'https:' && !isLoopbackUrl(url)) throw new Error('服务器必须使用 HTTPS')
    configuration = {
      serverOrigin: url.origin,
      token: value.token || undefined,
      channel: value.channel === 'beta' ? 'beta' : 'stable',
    }
    setState({ channel: configuration.channel })
    scheduleChecks()
    await reportSuccessfulStart()
    return state
  })
  /** 获取当前更新状态 */
  ipcMain.handle('updater:get-state', (event) => {
    assertTrustedSender(event.sender)
    return { ...state, transferBlockers: totalTransferBlockers() }
  })
  /** 手动检查更新 */
  ipcMain.handle('updater:check', (event) => {
    assertTrustedSender(event.sender)
    return checkForUpdates(true)
  })
  /** 下载更新 */
  ipcMain.handle('updater:download', (event) => {
    assertTrustedSender(event.sender)
    return downloadUpdate()
  })
  /** 安装更新（等待传输任务完成） */
  ipcMain.handle('updater:install', (event) => {
    assertTrustedSender(event.sender)
    return installUpdate()
  })
  /** 设置渲染进程传输任务数，当传输清零且有待安装更新时自动触发安装 */
  ipcMain.handle('updater:set-transfer-count', async (event, count: number) => {
    assertTrustedSender(event.sender)
    rendererTransferCount = Math.max(0, Math.floor(Number(count) || 0))
    setState({ transferBlockers: totalTransferBlockers() })
    if (installWhenReady && totalTransferBlockers() === 0) await installUpdate()
    return true
  })
}

/**
 * 初始化更新器模块（由主进程 app.whenReady 中调用）
 * 注册事件监听、IPC 处理器，并在系统从休眠恢复时主动检查更新
 */
export function setupUpdater(value: UpdaterDependencies) {
  dependencies = value
  if (initialized) return
  initialized = true
  registerUpdaterEvents()
  registerUpdaterIpc()
  powerMonitor.on('resume', () => void checkForUpdates())
}

/**
 * 刷新传输阻塞状态（由主进程文件下载/取消时调用）
 * 当传输任务清零且有待安装更新时自动触发安装
 */
export function refreshUpdaterTransferState() {
  setState({ transferBlockers: totalTransferBlockers() })
  if (installWhenReady && totalTransferBlockers() === 0) void installUpdate()
}
