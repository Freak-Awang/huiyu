/**
 * Electron 主进程入口
 *
 * 管理原生窗口生命周期、系统托盘、桌面通知、截图、文件下载、自动更新及 IPC 通信。
 * 所有 native 能力通过 preload 脚本的白名单 IPC 暴露给渲染进程，保持 sandbox 隔离。
 * 支持单实例锁，点击关闭按钮最小化到托盘（macOS 除外）。
 */
import { app, BrowserWindow, Menu, Notification, Tray, desktopCapturer, dialog, ipcMain, nativeImage, net, screen, shell } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  listLocalMessages,
  clearLocalMessages,
  getLocalMessageStats,
  searchLocalMessages,
  upsertLocalMessage,
  type LocalMessageRecord,
} from './localMessages.js'
import { refreshUpdaterTransferState, setupUpdater } from './updater.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

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

/** 截图操作结果 */
interface ScreenshotResult {
  canceled: boolean
  dataUrl?: string
}

/** 截图窗口初始化数据载荷 */
interface ScreenshotPayload {
  dataUrl: string
  scaleFactor: number
}

/** 活跃截图会话状态 */
interface ActiveScreenshot {
  window: BrowserWindow
  payload: ScreenshotPayload
  resolve: (result: ScreenshotResult) => void
  /** 截图前主窗口是否可见，截图完成后决定是否恢复 */
  shouldRestoreMainWindow: boolean
  /** 防止多次 resolve */
  settled: boolean
}

/** 文件下载 IPC 请求载荷 */
interface FileDownloadPayload {
  downloadId: string
  fileId: string
  serverOrigin: string
  token: string
  suggestedName: string
}

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

/** 当前活跃的截图会话（同时只能有一个） */
let activeScreenshot: ActiveScreenshot | null = null

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAM0lEQVR4AWMYmWL8z0ABYBw1gGE0DBgYGBh+MDAw7Gf4//8/AxKdgYEBiI5Eo2EAAJp8CwY0Vb4pAAAAAElFTkSuQmCC'
  )
  tray = new Tray(icon)
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

/**
 * 截取指定屏幕的画面
 * 使用屏幕的物理缩放因子捕获，确保截图标注坐标精确映射
 */
async function captureDisplay(display: Electron.Display): Promise<string> {
  const thumbnailSize = {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor),
  }
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize,
  })
  const source =
    sources.find((item) => item.display_id === String(display.id)) ||
    sources.find((item) => !item.thumbnail.isEmpty()) ||
    sources[0]

  if (!source || source.thumbnail.isEmpty()) {
    throw new Error('无法获取屏幕截图源')
  }
  return source.thumbnail.toDataURL()
}

/** 加载截图入口页面，开发模式追加 mode=screenshot 参数 */
function loadScreenshotEntry(window: BrowserWindow) {
  if (process.env.VITE_DEV_SERVER_URL) {
    const url = new URL(process.env.VITE_DEV_SERVER_URL)
    url.searchParams.set('mode', 'screenshot')
    window.loadURL(url.toString())
    return
  }
  window.loadFile(join(__dirname, '../dist/index.html'), {
    query: { mode: 'screenshot' },
  })
}

/**
 * 完成截图流程：resolve Promise、关闭截图窗口、按需恢复主窗口
 * @returns 是否成功完成（防止重复 resolve）
 */
function finishScreenshot(result: ScreenshotResult): boolean {
  const active = activeScreenshot
  if (!active || active.settled) return false

  active.settled = true
  activeScreenshot = null
  active.resolve(result)

  if (!active.window.isDestroyed()) {
    active.window.close()
  }
  if (active.shouldRestoreMainWindow && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
  }
  return true
}

/** 判断 IPC 请求是否来自当前截图窗口 */
function isScreenshotSender(event: Electron.IpcMainInvokeEvent): boolean {
  return !!activeScreenshot && event.sender === activeScreenshot.window.webContents
}

/**
 * 启动截图流程
 * 1. 隐藏主窗口（避免遮挡截图区域）
 * 2. 捕获屏幕画面
 * 3. 创建全屏透明截图窗口供用户框选区域
 * 4. 用户确认/取消后恢复主窗口
 */
async function startScreenshot(): Promise<ScreenshotResult> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { canceled: true }
  }
  if (activeScreenshot) {
    return { canceled: true }
  }

  const display = screen.getDisplayMatching(mainWindow.getBounds())
  const bounds = display.bounds
  const shouldRestoreMainWindow = mainWindow.isVisible()
  if (shouldRestoreMainWindow) {
    mainWindow.hide()
    await delay(150) // 等待窗口完全隐藏后再截图，避免窗口残影
  }

  try {
    const dataUrl = await captureDisplay(display)
    const screenshotWindow = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#000000',
      webPreferences: {
        preload: join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    screenshotWindow.setAlwaysOnTop(true, 'screen-saver')
    hardenRendererWindow(screenshotWindow)

    return await new Promise<ScreenshotResult>((resolve) => {
      activeScreenshot = {
        window: screenshotWindow,
        payload: { dataUrl, scaleFactor: display.scaleFactor },
        resolve,
        shouldRestoreMainWindow,
        settled: false,
      }

      screenshotWindow.once('closed', () => {
        finishScreenshot({ canceled: true })
      })
      screenshotWindow.webContents.once('did-finish-load', () => {
        screenshotWindow.show()
        screenshotWindow.focus()
      })
      screenshotWindow.webContents.once('did-fail-load', () => {
        finishScreenshot({ canceled: true })
      })
      loadScreenshotEntry(screenshotWindow)
    })
  } catch (err) {
    if (shouldRestoreMainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
    console.error('截图启动失败:', err)
    return { canceled: true }
  }
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
  refreshUpdaterTransferState()
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
    refreshUpdaterTransferState()
  }
})

/** 取消文件下载 */
ipcMain.handle('files:cancel-download', (event, downloadId: string) => {
  assertMainWindowSender(event)
  const controller = activeFileDownloads.get(String(downloadId || ''))
  controller?.abort()
  return !!controller
})

/** 启动截图流程 */
ipcMain.handle('screenshot:start', (event) => {
  assertMainWindowSender(event)
  return startScreenshot()
})

/** 截图窗口获取初始数据（屏幕截图 + 缩放因子） */
ipcMain.handle('screenshot:getInitialData', (event) => {
  if (!isScreenshotSender(event)) return null
  return activeScreenshot?.payload ?? null
})

/** 截图确认：渲染进程传回框选区域的 PNG DataURL */
ipcMain.handle('screenshot:confirm', (event, dataUrl: string) => {
  if (!isScreenshotSender(event) || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png')) {
    return false
  }
  return finishScreenshot({ canceled: false, dataUrl })
})

/** 截图取消 */
ipcMain.handle('screenshot:cancel', (event) => {
  if (!isScreenshotSender(event)) return false
  return finishScreenshot({ canceled: true })
})

// ==================== 应用生命周期 ====================

app.whenReady().then(() => {
  // 初始化自动更新模块
  setupUpdater({
    getMainWindow: () => mainWindow,
    getNativeTransferCount: () => activeFileDownloads.size,
    beforeInstall: () => {
      isQuitting = true // 安装更新前标记退出，避免托盘逻辑阻止窗口关闭
    },
  })
  createMainWindow()
  createTray()
  // 无边框窗口不再挂载原生应用菜单，避免菜单栏浮出
  Menu.setApplicationMenu(null)

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

// 退出前取消所有活跃的文件下载
app.on('before-quit', () => {
  isQuitting = true
  activeFileDownloads.forEach((controller) => controller.abort())
})

// macOS 特殊处理：关闭所有窗口不退出应用（符合 macOS 惯例）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
