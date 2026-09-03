/**
 * Electron 主进程入口
 *
 * 管理原生窗口生命周期、系统托盘、桌面通知、文件下载及 IPC 通信。
 * 所有 native 能力通过 preload 脚本的白名单 IPC 暴露给渲染进程，保持 sandbox 隔离。
 * 支持单实例锁，点击关闭按钮最小化到托盘（macOS 除外）。
 */
import { app, BrowserWindow, Menu, MessageChannelMain, Notification, Tray, dialog, ipcMain, nativeImage, net, shell } from 'electron'
import type { IpcMainInvokeEvent, MessagePortMain } from 'electron'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  listLocalMessages,
  clearLocalConversationMessages,
  clearLocalMessages,
  getLocalMessageStats,
  searchLocalMessages,
  upsertLocalMessage,
  type LocalMessageRecord,
} from './localMessages.js'
import { installPendingUpdateOnQuit, registerUpdateHandlers, shouldInstallOnQuit } from './updater.js'
import { assertP2pWriteBounds, resolveP2pEntryPath, safeP2pRelativePath } from './p2pReceiveSafety.js'
import { configureInternalCertificateTrust } from './internalCertificateTrust.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** 应用图标路径：开发模式读 public/，生产模式读 Vite 拷贝进 dist/ 的副本 */
function appIconPath(filename = 'app-icon.png') {
  const base = process.env.VITE_DEV_SERVER_URL ? '../public' : '../dist'
  return join(__dirname, base, filename)
}

/** 主窗口实例 */
let mainWindow: BrowserWindow | null = null

/** 系统托盘实例 */
let tray: Tray | null = null

/** 是否正在退出应用（防止 close 事件中重复隐藏窗口） */
let isQuitting = false

/** 关闭按钮行为：tray 最小化到托盘，exit 直接退出 */
let closeBehavior: 'tray' | 'exit' = 'tray'

/** 未读消息计数，用于更新托盘图标和任务栏徽标 */
let unreadCount = 0

/** 活跃的文件下载任务映射，用于取消下载和更新器传输状态统计 */
const activeFileDownloads = new Map<string, AbortController>()

/** 文件下载 IPC 请求载荷 */
interface FileDownloadPayload {
  downloadId: string
  fileId: string
  serverOrigin: string
  token: string
  suggestedName: string
}

interface P2pReceiveStartPayload {
  transferId: string
  kind: 'file' | 'folder'
  name: string
  totalSize: number
  fileCount: number
}

interface P2pManifestEntry {
  index: number
  path: string
  name: string
  size: number
  contentType?: string
  sha256: string
}

interface P2pReceiveSession {
  receiveId: string
  transferId: string
  kind: 'file' | 'folder'
  name: string
  totalSize: number
  fileCount: number
  finalPath: string
  temporaryPath: string
  port: MessagePortMain
  entries: P2pManifestEntry[]
  paths: Map<number, string>
  handles: Map<number, FileHandle>
  offsets: Map<number, number>
  verified: Set<number>
  writeChain: Promise<void>
}

const P2P_MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024
const P2P_MAX_FOLDER_SIZE = 20 * 1024 * 1024 * 1024
const P2P_MAX_FOLDER_FILES = 10_000
const P2P_MAX_CHUNK_SIZE = 64 * 1024
const p2pReceiveSessions = new Map<string, P2pReceiveSession>()
const p2pCompletedRuntimePaths = new Map<string, string>()

/** 用户选择的文件存储目录，首次读取后缓存在主进程内 */
let storageLocation: string | null = null

function storagePreferencesPath() {
  return join(app.getPath('userData'), 'storage-preferences.json')
}

function defaultStorageLocation() {
  return join(app.getPath('documents'), 'ArtTalk Files')
}

/** 读取文件存储目录；配置缺失或损坏时回退到“文档/ArtTalk Files” */
async function getStorageLocation() {
  if (!storageLocation) {
    try {
      const preferences = JSON.parse(await readFile(storagePreferencesPath(), 'utf8')) as { location?: unknown }
      storageLocation = typeof preferences.location === 'string' && preferences.location.trim()
        ? preferences.location
        : defaultStorageLocation()
    } catch {
      storageLocation = defaultStorageLocation()
    }
  }
  await mkdir(storageLocation, { recursive: true })
  return storageLocation
}

/** 原子保存文件存储目录，避免配置写入中断 */
async function saveStorageLocation(location: string) {
  const normalized = location.trim()
  if (!normalized) throw new Error('存储位置不能为空')
  await mkdir(normalized, { recursive: true })
  const preferencesFile = storagePreferencesPath()
  const temporary = `${preferencesFile}.${process.pid}.tmp`
  await mkdir(dirname(preferencesFile), { recursive: true })
  await writeFile(temporary, JSON.stringify({ location: normalized }), { encoding: 'utf8', mode: 0o600 })
  await rename(temporary, preferencesFile)
  storageLocation = normalized
  return normalized
}

function p2pOrphanRegistryPath() {
  return join(app.getPath('userData'), 'p2p-receive-orphans.json')
}

function p2pCompletedRegistryPath() {
  return join(app.getPath('userData'), 'p2p-completed-paths.json')
}

async function readP2pCompletedPaths() {
  try {
    const value = JSON.parse(await readFile(p2pCompletedRegistryPath(), 'utf8'))
    const persisted = value && typeof value === 'object' ? value as Record<string, string> : {}
    return { ...persisted, ...Object.fromEntries(p2pCompletedRuntimePaths) }
  } catch {
    return Object.fromEntries(p2pCompletedRuntimePaths)
  }
}

async function saveP2pCompletedPath(transferId: string, path: string) {
  const values = await readP2pCompletedPaths()
  values[transferId] = path
  const target = p2pCompletedRegistryPath()
  const temporary = `${target}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(Object.fromEntries(Object.entries(values).slice(-200))), {
    encoding: 'utf8', mode: 0o600,
  })
  await rename(temporary, target)
}

async function readP2pOrphans() {
  try {
    const value = JSON.parse(await readFile(p2pOrphanRegistryPath(), 'utf8'))
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

async function writeP2pOrphans(paths: string[]) {
  const target = p2pOrphanRegistryPath()
  const temporary = `${target}.${process.pid}.tmp`
  await mkdir(dirname(target), { recursive: true })
  await writeFile(temporary, JSON.stringify([...new Set(paths)]), { encoding: 'utf8', mode: 0o600 })
  await rename(temporary, target)
}

async function addP2pOrphan(path: string) {
  await writeP2pOrphans([...(await readP2pOrphans()), path])
}

async function removeP2pOrphan(path: string) {
  await writeP2pOrphans((await readP2pOrphans()).filter((item) => item !== path))
}

async function cleanupP2pOrphans() {
  const paths = await readP2pOrphans()
  for (const path of paths) {
    const leaf = basename(path)
    if (path.endsWith('.arttalk.part') || /^\.arttalk-[0-9a-f-]{36}\.part$/i.test(leaf)) {
      await rm(path, { recursive: true, force: true }).catch(() => undefined)
    }
  }
  await writeP2pOrphans([])
}

function safeP2pName(value: string, fallback: string) {
  const name = basename(String(value || fallback)).normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().replace(/[. ]+$/g, '')
  if (!name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) return fallback
  return name.slice(0, 255)
}

async function pathExists(path: string) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function uniqueP2pFolderPath(parent: string, requestedName: string) {
  const name = safeP2pName(requestedName, '文件夹')
  let candidate = join(parent, name)
  let suffix = 1
  while (await pathExists(candidate)) {
    candidate = join(parent, `${name} (${suffix})`)
    suffix += 1
  }
  return candidate
}

function sha256Path(path: string) {
  return new Promise<string>((resolveHash, rejectHash) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', rejectHash)
    stream.on('end', () => resolveHash(hash.digest('hex')))
  })
}

async function closeP2pHandles(session: P2pReceiveSession) {
  await session.writeChain.catch(() => undefined)
  await Promise.all([...session.handles.values()].map((handle) => handle.close().catch(() => undefined)))
  session.handles.clear()
}

async function abortP2pReceive(receiveId: string) {
  const session = p2pReceiveSessions.get(receiveId)
  if (!session) return false
  p2pReceiveSessions.delete(receiveId)
  await closeP2pHandles(session)
  session.port.close()
  await rm(session.temporaryPath, { recursive: true, force: true }).catch(() => undefined)
  await removeP2pOrphan(session.temporaryPath).catch(() => undefined)
  return true
}

function respondP2pPort(session: P2pReceiveSession, requestId: string, payload: Record<string, unknown>) {
  session.port.postMessage({ requestId, ...payload })
}

function bindP2pReceivePort(session: P2pReceiveSession) {
  session.port.on('message', (event) => {
    const message = event.data as {
      type?: string
      requestId?: string
      fileIndex?: number
      offset?: number
      data?: ArrayBuffer
    }
    if (message?.type !== 'write' || !message.requestId) return
    const requestId = message.requestId
    session.writeChain = session.writeChain.then(async () => {
      const entry = session.entries[Number(message.fileIndex)]
      const path = session.paths.get(Number(message.fileIndex))
      let handle = session.handles.get(Number(message.fileIndex))
      const expectedOffset = session.offsets.get(Number(message.fileIndex))
      if (!entry || !path || expectedOffset == null || !(message.data instanceof ArrayBuffer)) {
        throw new Error('Invalid P2P write request')
      }
      assertP2pWriteBounds(
        entry.size, expectedOffset, Number(message.offset), message.data.byteLength, P2P_MAX_CHUNK_SIZE,
      )
      if (!handle) {
        handle = await open(path, 'r+')
        session.handles.set(entry.index, handle)
      }
      const buffer = Buffer.from(message.data)
      const result = await handle.write(buffer, 0, buffer.byteLength, expectedOffset)
      if (result.bytesWritten !== buffer.byteLength) throw new Error('Incomplete P2P disk write')
      const nextOffset = expectedOffset + result.bytesWritten
      session.offsets.set(entry.index, nextOffset)
      respondP2pPort(session, requestId, { ok: true, offset: nextOffset })
    }).catch((error) => {
      respondP2pPort(session, requestId, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  })
  session.port.start()
}

/**
 * 校验 URL 是否来自可信的渲染进程来源
 * 开发模式：匹配 Vite 开发服务器 origin
 * 生产模式：必须为 file:// 协议且指向 dist/index.html
 */
function isTrustedRendererUrl(value: string) {
  try {
    const target = new URL(value)
    if (process.env.VITE_DEV_SERVER_URL) {
      return target.origin === new URL(process.env.VITE_DEV_SERVER_URL).origin
    }
    return target.protocol === 'file:'
      && fileURLToPath(target).toLowerCase() === join(__dirname, '../dist/index.html').toLowerCase()
  } catch {
    return false
  }
}

/**
 * 加固渲染进程窗口安全策略
 * - 阻止窗口弹出，仅允许 https 外链通过系统浏览器打开
 * - 阻止导航到非可信 URL
 * - 禁用 webview 标签
 */
function hardenRendererWindow(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault()
  })
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
}

/** 断言 IPC 请求来自主窗口，防止其他窗口或 webview 伪造请求 */
function assertMainWindowSender(event: IpcMainInvokeEvent) {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error('IPC 请求并非来自主应用窗口')
  }
}

/**
 * 创建主窗口
 * 开启 contextIsolation + sandbox，所有 native 能力仅通过 preload IPC 白名单暴露
 * 启用 frame: false，让渲染端自行绘制无边框窗口外观（含自定义标题栏控制按钮）
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 820,
    height: 720,
    minWidth: 640,
    minHeight: 580,
    title: 'ArtTalk',
    backgroundColor: '#f5f5f5',
    frame: false,
    icon: appIconPath(),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // 监听原生最大化/还原事件，向渲染进程广播以同步自定义窗口控制按钮状态
  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximize-changed', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximize-changed', false))

  // 关闭窗口时：非退出状态且配置为最小化到托盘，则隐藏而非关闭
  mainWindow.on('close', (event) => {
    if (!isQuitting && closeBehavior === 'tray') {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
  hardenRendererWindow(mainWindow)

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }
}

/**
 * 创建系统托盘
 * 右键菜单提供"显示主窗口"和"退出"两个操作
 * 双击托盘图标显示主窗口
 */
function createTray() {
  const icon = nativeImage.createFromPath(appIconPath('app-icon-32.png'))
  tray = new Tray(icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('ArtTalk')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => mainWindow?.show() },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ])
  )
  tray.on('double-click', () => mainWindow?.show())
}

/** 将主窗口置于前台：显示、还原、聚焦 */
function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.focus()
  mainWindow.flashFrame(false)
}

/**
 * 更新未读消息徽标
 * 同步更新托盘 tooltip、窗口标题、Dock 徽标（macOS）
 * Windows 上额外设置任务栏覆盖图标
 */
function updateUnreadBadge(count: number) {
  unreadCount = Math.max(0, Math.floor(Number(count) || 0))
  const label = unreadCount > 0 ? `ArtTalk (${unreadCount}条未读)` : 'ArtTalk'
  tray?.setToolTip(label)
  mainWindow?.setTitle(label)
  app.setBadgeCount(unreadCount)

  if (process.platform === 'win32' && mainWindow && !mainWindow.isDestroyed()) {
    const overlay = unreadCount > 0
      ? nativeImage.createFromDataURL(
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAPElEQVR4AWNkwA38//8/AyWAiYFCwA0wYGBg+M/AwPCfAUMOKMREhYFBgAFGGhgaJLCJga5BkgQAIbAKGcMjtE8AAAAASUVORK5CYII='
        )
      : null
    mainWindow.setOverlayIcon(overlay, unreadCount > 0 ? `${unreadCount}条未读` : '')
  }
}

/** 创建应用菜单栏：应用（显示/最小化/退出）、查看（刷新/开发者工具） */
function createMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: '应用',
        submenu: [
          { label: '显示主窗口', click: () => mainWindow?.show() },
          { role: 'minimize', label: '最小化' },
          { type: 'separator' },
          {
            label: '退出',
            click: () => {
              isQuitting = true
              app.quit()
            },
          },
        ],
      },
      {
        label: '查看',
        submenu: [
          { role: 'reload', label: '刷新' },
          { role: 'toggleDevTools', label: '开发者工具' },
        ],
      },
    ])
  )
}

// ==================== IPC 处理器 ====================
// 以下为渲染进程可调用的 IPC 接口，全部通过 assertMainWindowSender 校验来源
// 保持载荷窄且可序列化，不暴露原生对象给渲染进程

/** 获取应用版本号 */
ipcMain.handle('app:getVersion', (event) => {
  assertMainWindowSender(event)
  return app.getVersion()
})

/** 获取当前操作系统平台 */
ipcMain.handle('app:getPlatform', (event) => {
  assertMainWindowSender(event)
  return process.platform
})

/** 设置关闭按钮行为：最小化到托盘 或 直接退出 */
ipcMain.handle('app:setCloseBehavior', (event, behavior: 'tray' | 'exit') => {
  assertMainWindowSender(event)
  closeBehavior = behavior === 'exit' ? 'exit' : 'tray'
  return true
})

/** 自定义窗口控制 IPC：最小化、最大/恢复、关闭 */
ipcMain.handle('window:minimize', (event) => {
  assertMainWindowSender(event)
  mainWindow?.minimize()
  return true
})

ipcMain.handle('window:toggleMaximize', (event) => {
  assertMainWindowSender(event)
  if (!mainWindow) return false
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow.maximize()
  }
  return mainWindow.isMaximized()
})

ipcMain.handle('window:close', (event) => {
  assertMainWindowSender(event)
  // 复用现有的 close 事件逻辑：tray 时隐藏窗口，exit 时真正退出
  mainWindow?.close()
  return true
})

ipcMain.handle('window:isMaximized', (event) => {
  assertMainWindowSender(event)
  return !!mainWindow?.isMaximized()
})

/** 窗口抖动（振屏）：在原位置附近快速小幅移动窗口，模拟 QQ 抖一抖效果 */
let windowShakeTimer: NodeJS.Timeout | null = null
ipcMain.handle('window:shake', (event) => {
  assertMainWindowSender(event)
  if (!mainWindow || mainWindow.isDestroyed()) return false
  // 最大化或最小化状态下无法移动窗口，退化为仅页面内容抖动
  if (mainWindow.isMaximized() || mainWindow.isMinimized()) return false
  // 抖动进行中则忽略叠加请求，避免窗口位置漂移
  if (windowShakeTimer) return false

  const [baseX, baseY] = mainWindow.getPosition()
  const offsets: Array<[number, number]> = [
    [10, 4], [-10, -4], [8, -5], [-8, 5], [6, 3], [-6, -3], [4, -2], [-4, 2], [0, 0],
  ]
  let step = 0
  windowShakeTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      if (windowShakeTimer) clearInterval(windowShakeTimer)
      windowShakeTimer = null
      return
    }
    const [dx, dy] = offsets[step]
    mainWindow.setPosition(baseX + dx, baseY + dy)
    step += 1
    if (step >= offsets.length) {
      if (windowShakeTimer) clearInterval(windowShakeTimer)
      windowShakeTimer = null
      // 确保窗口精确回到原位
      mainWindow.setPosition(baseX, baseY)
    }
  }, 50)
  return true
})

/** 通过系统默认浏览器打开外链，仅允许 https/http 协议 */
ipcMain.handle('app:openExternal', async (event, url: string) => {
  assertMainWindowSender(event)
  if (/^https?:\/\//i.test(url)) {
    await shell.openExternal(url)
    return true
  }
  return false
})

/** 获取文件默认存储目录 */
ipcMain.handle('storage:get-location', (event) => {
  assertMainWindowSender(event)
  return getStorageLocation()
})

/** 通过系统目录选择器更改文件默认存储目录 */
ipcMain.handle('storage:choose-location', async (event) => {
  assertMainWindowSender(event)
  if (!mainWindow) return { canceled: true }
  const currentLocation = await getStorageLocation()
  const selection = await dialog.showOpenDialog(mainWindow, {
    title: '选择存储位置',
    defaultPath: currentLocation,
    properties: ['openDirectory', 'createDirectory'],
  })
  if (selection.canceled || !selection.filePaths[0]) {
    return { canceled: true, path: currentLocation }
  }
  return { canceled: false, path: await saveStorageLocation(selection.filePaths[0]) }
})

/** 使用系统文件管理器打开当前存储目录 */
ipcMain.handle('storage:open-location', async (event) => {
  assertMainWindowSender(event)
  const error = await shell.openPath(await getStorageLocation())
  return error ? { success: false, error } : { success: true }
})

/** 更新未读消息徽标（托盘/任务栏/Dock） */
ipcMain.handle('notification:setUnreadBadge', (event, count: number) => {
  assertMainWindowSender(event)
  updateUnreadBadge(count)
  return true
})

/**
 * 弹出桌面通知
 * 点击通知后聚焦主窗口，并发送 IPC 事件通知渲染进程跳转到对应会话
 */
ipcMain.handle('notification:show', (event, payload: { title?: string; body?: string; conversationId?: string }) => {
  assertMainWindowSender(event)
  const title = payload?.title || 'ArtTalk'
  const body = payload?.body || '收到一条新消息'
  const conversationId = String(payload?.conversationId || '')
  if (Notification.isSupported()) {
    const notification = new Notification({ title, body })
    notification.on('click', () => {
      focusMainWindow()
      if (conversationId) {
        mainWindow?.webContents.send('notification:open-conversation', conversationId)
      }
    })
    notification.show()
  }
  // 主窗口不在焦点时闪烁任务栏
  if (mainWindow && !mainWindow.isFocused()) {
    mainWindow.flashFrame(true)
  }
  return true
})
/**
 * 保存/更新本地消息缓存
 * 渲染进程每收到/发送一条消息即调用此接口，确保本地历史在应用重启后仍然可用
 */
ipcMain.handle('messages:upsert', async (event, userId: string, message: LocalMessageRecord) => {
  assertMainWindowSender(event)
  await upsertLocalMessage(userId, message)
  return true
})

/** 分页查询本地消息历史 */
ipcMain.handle(
  'messages:list',
  (event, userId: string, conversationId: string, beforeMessageId?: string, pageSize?: number) => {
    assertMainWindowSender(event)
    return listLocalMessages(userId, conversationId, beforeMessageId, pageSize)
  },
)

/** 在本地消息中搜索关键词 */
ipcMain.handle(
  'messages:search',
  (event, userId: string, conversationId: string, keyword: string, limit?: number) => {
    assertMainWindowSender(event)
    return searchLocalMessages(userId, conversationId, keyword, limit)
  },
)

/** 获取本地消息缓存统计信息 */
ipcMain.handle('messages:stats', (event, userId: string) => {
  assertMainWindowSender(event)
  return getLocalMessageStats(userId)
})

/** 清空本地消息缓存 */
ipcMain.handle('messages:clear', (event, userId: string) => {
  assertMainWindowSender(event)
  return clearLocalMessages(userId)
})

/** 清空指定会话的本地消息缓存 */
ipcMain.handle('messages:clear-conversation', (event, userId: string, conversationId: string) => {
  assertMainWindowSender(event)
  return clearLocalConversationMessages(userId, conversationId)
})

ipcMain.handle('p2p:receive-start', async (event, payload: P2pReceiveStartPayload) => {
  assertMainWindowSender(event)
  if (!mainWindow || !/^p2p_[a-z0-9]+$/i.test(String(payload?.transferId || ''))
    || !['file', 'folder'].includes(payload?.kind)
    || !Number.isSafeInteger(payload?.totalSize) || payload.totalSize <= 0
    || !Number.isInteger(payload?.fileCount) || payload.fileCount <= 0) {
    return { canceled: false, success: false, error: 'Invalid P2P receive request' }
  }
  if ((payload.kind === 'file' && (payload.fileCount !== 1 || payload.totalSize > P2P_MAX_FILE_SIZE))
    || (payload.kind === 'folder'
      && (payload.fileCount > P2P_MAX_FOLDER_FILES || payload.totalSize > P2P_MAX_FOLDER_SIZE))) {
    return { canceled: false, success: false, error: 'P2P receive limit exceeded' }
  }

  const safeName = safeP2pName(payload.name, payload.kind === 'file' ? 'file' : '文件夹')
  let finalPath: string
  let temporaryPath: string
  if (payload.kind === 'file') {
    const selection = await dialog.showSaveDialog(mainWindow, {
      title: '接收 P2P 文件',
      defaultPath: join(await getStorageLocation(), safeName),
    })
    if (selection.canceled || !selection.filePath) return { canceled: true, success: false }
    finalPath = selection.filePath
    temporaryPath = `${finalPath}.arttalk.part`
    const conflicts = [...p2pReceiveSessions.values()].some((session) =>
      session.finalPath.toLowerCase() === finalPath.toLowerCase()
      || session.temporaryPath.toLowerCase() === temporaryPath.toLowerCase())
    if (conflicts) {
      return { canceled: false, success: false, error: '该保存位置已有正在进行的 P2P 接收任务' }
    }
  } else {
    const selection = await dialog.showOpenDialog(mainWindow, {
      title: '选择文件夹保存位置',
      defaultPath: await getStorageLocation(),
      properties: ['openDirectory', 'createDirectory'],
    })
    if (selection.canceled || !selection.filePaths[0]) return { canceled: true, success: false }
    finalPath = await uniqueP2pFolderPath(selection.filePaths[0], safeName)
    temporaryPath = join(selection.filePaths[0], `.arttalk-${randomUUID()}.part`)
  }

  const receiveId = `recv_${randomUUID().replace(/-/g, '')}`
  const { port1, port2 } = new MessageChannelMain()
  const session: P2pReceiveSession = {
    receiveId,
    transferId: payload.transferId,
    kind: payload.kind,
    name: safeName,
    totalSize: payload.totalSize,
    fileCount: payload.fileCount,
    finalPath,
    temporaryPath,
    port: port2,
    entries: [],
    paths: new Map(),
    handles: new Map(),
    offsets: new Map(),
    verified: new Set(),
    writeChain: Promise.resolve(),
  }
  p2pReceiveSessions.set(receiveId, session)
  try {
    await addP2pOrphan(temporaryPath)
    bindP2pReceivePort(session)
    event.sender.postMessage('p2p:receive-port', { receiveId }, [port1])
  } catch (error) {
    p2pReceiveSessions.delete(receiveId)
    port1.close()
    port2.close()
    return {
      canceled: false,
      success: false,
      error: error instanceof Error ? error.message : '无法创建 P2P 接收任务',
    }
  }
  return { canceled: false, success: true, receiveId, finalPath }
})

ipcMain.handle('p2p:receive-prepare', async (event, receiveId: string, entries: P2pManifestEntry[]) => {
  assertMainWindowSender(event)
  const session = p2pReceiveSessions.get(String(receiveId || ''))
  if (!session) throw new Error('P2P receive session not found')
  if (session.entries.length) {
    return { offsets: Object.fromEntries(session.offsets), finalPath: session.finalPath }
  }
  if (!Array.isArray(entries) || entries.length !== session.fileCount) {
    throw new Error('P2P manifest file count mismatch')
  }
  const ordered = [...entries].sort((left, right) => left.index - right.index)
  const seenPaths = new Set<string>()
  let totalSize = 0
  try {
    if (session.kind === 'folder') await mkdir(session.temporaryPath, { recursive: false })
    for (const [expectedIndex, entry] of ordered.entries()) {
      if (entry.index !== expectedIndex || !Number.isSafeInteger(entry.size) || entry.size <= 0
        || entry.size > P2P_MAX_FILE_SIZE || !/^[0-9a-f]{64}$/i.test(entry.sha256)) {
        throw new Error('Invalid P2P manifest entry')
      }
      const safeRelative = session.kind === 'folder'
        ? safeP2pRelativePath(entry.path)
        : entry.path.replace(/\\/g, '/')
      const path = session.kind === 'file'
        ? session.temporaryPath
        : resolveP2pEntryPath(session.temporaryPath, safeRelative)
      if (seenPaths.has(safeRelative.toLowerCase())) throw new Error('Duplicate P2P folder path')
      seenPaths.add(safeRelative.toLowerCase())
      totalSize += entry.size

      await mkdir(dirname(path), { recursive: true })
      const handle = await open(path, 'w')
      await handle.close()
      session.paths.set(entry.index, path)
      session.offsets.set(entry.index, 0)
    }
    if (totalSize !== session.totalSize) throw new Error('P2P manifest size mismatch')
    session.entries = ordered
    return { offsets: Object.fromEntries(session.offsets), finalPath: session.finalPath }
  } catch (error) {
    await abortP2pReceive(session.receiveId)
    throw error
  }
})

ipcMain.handle('p2p:receive-finish-file', async (event, receiveId: string, fileIndex: number) => {
  assertMainWindowSender(event)
  const session = p2pReceiveSessions.get(String(receiveId || ''))
  const entry = session?.entries[Number(fileIndex)]
  const path = session?.paths.get(Number(fileIndex))
  const handle = session?.handles.get(Number(fileIndex))
  if (!session || !entry || !path) throw new Error('P2P receive file not found')
  if (session.verified.has(entry.index)) {
    return { success: true, offset: entry.size, sha256: entry.sha256 }
  }
  if (!handle) throw new Error('P2P receive file handle not found')
  await session.writeChain
  if (session.offsets.get(entry.index) !== entry.size) throw new Error('P2P file is incomplete')
  await handle.sync()
  await handle.close()
  session.handles.delete(entry.index)
  const actualHash = await sha256Path(path)
  if (actualHash.toLowerCase() !== entry.sha256.toLowerCase()) {
    await rm(path, { force: true })
    throw new Error('P2P file checksum mismatch')
  }
  session.verified.add(entry.index)
  return { success: true, offset: entry.size, sha256: actualHash }
})

ipcMain.handle('p2p:receive-commit', async (event, receiveId: string) => {
  assertMainWindowSender(event)
  const session = p2pReceiveSessions.get(String(receiveId || ''))
  if (!session || session.verified.size !== session.fileCount) throw new Error('P2P receive is incomplete')
  await closeP2pHandles(session)
  if (session.kind === 'folder' && await pathExists(session.finalPath)) {
    session.finalPath = await uniqueP2pFolderPath(dirname(session.finalPath), session.name)
  }
  await rename(session.temporaryPath, session.finalPath)
  p2pReceiveSessions.delete(session.receiveId)
  session.port.close()
  await removeP2pOrphan(session.temporaryPath)
  p2pCompletedRuntimePaths.set(session.transferId, session.finalPath)
  await saveP2pCompletedPath(session.transferId, session.finalPath).catch(() => undefined)
  return { success: true, path: session.finalPath, transferId: session.transferId }
})

ipcMain.handle('p2p:receive-abort', async (event, receiveId: string) => {
  assertMainWindowSender(event)
  return abortP2pReceive(String(receiveId || ''))
})

ipcMain.handle('p2p:open-result', async (event, transferId: string) => {
  assertMainWindowSender(event)
  const paths = await readP2pCompletedPaths()
  const path = paths[String(transferId || '')]
  if (!path || !(await pathExists(path))) return { success: false, error: '本地文件已移动或删除' }
  const error = await shell.openPath(path)
  return error ? { success: false, error } : { success: true, path }
})

ipcMain.handle('p2p:reveal-result', async (event, transferId: string) => {
  assertMainWindowSender(event)
  const paths = await readP2pCompletedPaths()
  const path = paths[String(transferId || '')]
  if (!path || !(await pathExists(path))) return { success: false, error: '本地文件已移动或删除' }
  shell.showItemInFolder(path)
  return { success: true, path }
})

/**
 * 文件下载 IPC 处理器
 * 流程：校验参数 -> 弹出保存对话框 -> 流式下载到临时文件 -> 原子重命名为目标文件
 * 支持进度回传和取消操作，下载期间阻止自动更新安装
 */
ipcMain.handle('files:download', async (event, payload: FileDownloadPayload) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    return { canceled: false, success: false, error: 'Invalid download source' }
  }
  const downloadId = String(payload?.downloadId || '')
  const fileId = String(payload?.fileId || '')
  if (!downloadId || !/^\d+$/.test(fileId) || !payload?.token) {
    return { canceled: false, success: false, error: 'Invalid download request' }
  }
  let downloadUrl: URL
  try {
    const origin = new URL(payload.serverOrigin)
    const loopback = origin.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
    if (origin.protocol !== 'https:' && !loopback) throw new Error('Downloads require HTTPS')
    downloadUrl = new URL(`/api/files/download/${fileId}`, origin.origin)
  } catch {
    return { canceled: false, success: false, error: 'Invalid server address' }
  }
  // 清理文件名中的非法字符
  const safeName = basename(payload.suggestedName || `file-${fileId}`).replace(/[<>:"/\\|?*]/g, '_')
  const selection = await dialog.showSaveDialog(mainWindow, {
    defaultPath: join(await getStorageLocation(), safeName),
  })
  if (selection.canceled || !selection.filePath) return { canceled: true, success: false }

  const controller = new AbortController()
  activeFileDownloads.set(downloadId, controller)
  const partialPath = `${selection.filePath}.arttalk.part`
  const sendProgress = (progress: Record<string, unknown>) => {
    if (!event.sender.isDestroyed()) event.sender.send('files:download-progress', progress)
  }
  try {
    await rm(partialPath, { force: true })
    const response = await net.fetch(downloadUrl.toString(), {
      headers: { Authorization: `Bearer ${payload.token}` },
      signal: controller.signal,
    })
    if (!response.ok || !response.body) throw new Error(`Download failed (${response.status})`)
    const total = Number(response.headers.get('content-length') || 0)
    let received = 0
    const progress = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length
        sendProgress({ downloadId, received, total, state: 'downloading' })
        callback(null, chunk)
      },
    })
    // 流式下载：先写入 .part 临时文件，完成后再原子重命名
    await pipeline(Readable.fromWeb(response.body as any), progress, createWriteStream(partialPath))
    await rm(selection.filePath, { force: true })
    await rename(partialPath, selection.filePath)
    sendProgress({ downloadId, received, total, state: 'completed' })
    return { canceled: false, success: true, path: selection.filePath }
  } catch (error) {
    await rm(partialPath, { force: true }).catch(() => undefined)
    const canceled = controller.signal.aborted
    const message = error instanceof Error ? error.message : String(error)
    sendProgress({
      downloadId,
      received: 0,
      total: 0,
      state: canceled ? 'cancelled' : 'failed',
      error: canceled ? undefined : message,
    })
    return { canceled, success: false, error: canceled ? undefined : message }
  } finally {
    activeFileDownloads.delete(downloadId)
  }
})

/** 取消文件下载 */
ipcMain.handle('files:cancel-download', (event, downloadId: string) => {
  assertMainWindowSender(event)
  const controller = activeFileDownloads.get(String(downloadId || ''))
  controller?.abort()
  return !!controller
})

// ==================== 应用生命周期 ====================

// Windows：固定 AppUserModelId，确保任务栏图标、通知与安装包 appId 正确关联
app.setAppUserModelId('com.im.desktop')

app.whenReady().then(async () => {
  try {
    configureInternalCertificateTrust()
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    dialog.showErrorBox(
      '内部证书初始化失败',
      `绘语无法安全连接公司服务器，应用将退出。\n\n${reason}`,
    )
    app.quit()
    return
  }

  await cleanupP2pOrphans().catch(() => undefined)
  createMainWindow()
  createTray()
  // 无边框窗口不再挂载原生应用菜单，避免菜单栏浮出
  Menu.setApplicationMenu(null)

  // 注册在线更新模块：IPC 处理器 + 恢复待安装更新，托盘 tooltip 展示下载进度
  registerUpdateHandlers({
    getMainWindow: () => mainWindow,
    assertSender: assertMainWindowSender,
    onTrayProgress: (text) => tray?.setToolTip(text),
  })

  // macOS：点击 Dock 图标时，若无窗口则重新创建
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    } else {
      mainWindow?.show()
    }
  })
})

// 单实例锁：确保同一时间只有一个应用实例运行
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  // 第二个实例启动时，聚焦已有实例的主窗口
  app.on('second-instance', () => focusMainWindow())
}

// 退出前取消所有活跃的文件下载；若用户选择"退出时自动安装"则先执行更新安装
app.on('before-quit', (event) => {
  isQuitting = true
  activeFileDownloads.forEach((controller) => controller.abort())
  for (const receiveId of [...p2pReceiveSessions.keys()]) {
    void abortP2pReceive(receiveId)
  }
  if (shouldInstallOnQuit()) {
    event.preventDefault()
    void installPendingUpdateOnQuit()
  }
})

// macOS 特殊处理：关闭所有窗口不退出应用（符合 macOS 惯例）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
