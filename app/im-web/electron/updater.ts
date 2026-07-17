import electronUpdater from 'electron-updater'
import { app, BrowserWindow, ipcMain, net, powerMonitor } from 'electron'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'

const { autoUpdater } = electronUpdater

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'waiting-for-transfers'
  | 'installing'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  targetVersion?: string
  releaseName?: string
  releaseNotes?: string[]
  releaseDate?: string
  forceUpdate?: boolean
  percent?: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
  error?: string
  lastCheckedAt?: string
  channel: 'stable' | 'beta'
  transferBlockers: number
}

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

interface UpdaterConfiguration {
  serverOrigin: string
  token?: string
  channel?: 'stable' | 'beta'
}

interface PendingInstallMarker {
  targetVersion: string
  serverOrigin: string
  channel: 'stable' | 'beta'
}

interface CachedPolicy {
  serverOrigin: string
  channel: 'stable' | 'beta'
  savedAt: string
  policy: UpdatePolicy
}

interface UpdaterDependencies {
  getMainWindow: () => BrowserWindow | null
  getNativeTransferCount: () => number
  beforeInstall: () => void
}

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const INITIAL_CHECK_MIN_MS = 5_000
const INITIAL_CHECK_SPREAD_MS = 15_000

let dependencies: UpdaterDependencies | null = null
let configuration: Required<Pick<UpdaterConfiguration, 'serverOrigin' | 'channel'>> & { token?: string } | null = null
let rendererTransferCount = 0
let periodicTimer: ReturnType<typeof setInterval> | null = null
let initialTimer: ReturnType<typeof setTimeout> | null = null
let installWhenReady = false
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

async function getDeviceId() {
  const path = deviceIdPath()
  try {
    const existing = (await readFile(path, 'utf8')).trim()
    if (/^[0-9a-f-]{36}$/i.test(existing)) return existing
  } catch {
    // First run creates a stable, installation-scoped identifier below.
  }
  const id = randomUUID()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, id, { encoding: 'utf8', mode: 0o600 })
  return id
}

function totalTransferBlockers() {
  return Math.max(0, rendererTransferCount) + Math.max(0, dependencies?.getNativeTransferCount() || 0)
}

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

function updaterHeaders() {
  return configuration?.token ? { Authorization: `Bearer ${configuration.token}` } : undefined
}

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
    console.warn('Failed to report update event:', error)
    return false
  }
}

async function requestPolicy(): Promise<UpdatePolicy> {
  if (!configuration) throw new Error('Update server is not configured')
  const url = new URL('/api/client/releases/policy', configuration.serverOrigin)
  url.searchParams.set('platform', process.platform)
  url.searchParams.set('arch', process.arch)
  url.searchParams.set('channel', configuration.channel)
  url.searchParams.set('currentVersion', app.getVersion())
  url.searchParams.set('deviceId', await getDeviceId())
  const response = await net.fetch(url.toString(), { headers: updaterHeaders() })
  if (!response.ok) throw new Error(`Update policy request failed (${response.status})`)
  const body = await response.json() as { code?: number; message?: string; data?: UpdatePolicy; hasUpdate?: boolean }
  if ('code' in body && body.code !== 200) throw new Error(body.message || 'Update policy request failed')
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

function configureFeed(policy: UpdatePolicy) {
  if (!policy.updateBaseUrl) throw new Error('Update policy did not provide an update source')
  const source = new URL(policy.updateBaseUrl)
  if (!['http:', 'https:'].includes(source.protocol)) throw new Error('Unsupported update source protocol')
  autoUpdater.setFeedURL({ provider: 'generic', url: source.toString() })
  autoUpdater.channel = configuration?.channel === 'beta' ? 'beta' : 'latest'
  // electron-updater enables downgrades when channel is assigned, so reset it afterwards.
  autoUpdater.allowDowngrade = false
}

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

async function writePendingInstallMarker() {
  if (!configuration || !state.targetVersion) return
  const marker: PendingInstallMarker = {
    targetVersion: state.targetVersion,
    serverOrigin: configuration.serverOrigin,
    channel: configuration.channel,
  }
  await writeFile(pendingInstallPath(), JSON.stringify(marker), { encoding: 'utf8', mode: 0o600 })
}

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
    // No pending marker means this was a normal application start.
  }
}

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
    if (state.forceUpdate) void downloadUpdate()
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

function registerUpdaterIpc() {
  ipcMain.handle('updater:configure', async (_event, value: UpdaterConfiguration) => {
    const url = new URL(value.serverOrigin)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported server protocol')
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
  ipcMain.handle('updater:get-state', () => ({ ...state, transferBlockers: totalTransferBlockers() }))
  ipcMain.handle('updater:check', () => checkForUpdates(true))
  ipcMain.handle('updater:download', () => downloadUpdate())
  ipcMain.handle('updater:install', () => installUpdate())
  ipcMain.handle('updater:set-transfer-count', async (_event, count: number) => {
    rendererTransferCount = Math.max(0, Math.floor(Number(count) || 0))
    setState({ transferBlockers: totalTransferBlockers() })
    if (installWhenReady && totalTransferBlockers() === 0) await installUpdate()
    return true
  })
}

export function setupUpdater(value: UpdaterDependencies) {
  dependencies = value
  if (initialized) return
  initialized = true
  registerUpdaterEvents()
  registerUpdaterIpc()
  powerMonitor.on('resume', () => void checkForUpdates())
}

export function refreshUpdaterTransferState() {
  setState({ transferBlockers: totalTransferBlockers() })
  if (installWhenReady && totalTransferBlockers() === 0) void installUpdate()
}
