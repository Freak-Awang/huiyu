// Intent: Electron main process owns native window lifecycle, tray behavior, notifications, updates, screenshots, and IPC bridges.
import { app, BrowserWindow, Menu, Notification, Tray, desktopCapturer, dialog, ipcMain, nativeImage, net, screen, shell } from 'electron'
import { createWriteStream } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
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
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let closeBehavior: 'tray' | 'exit' = 'tray'
let unreadCount = 0
const activeFileDownloads = new Map<string, AbortController>()

interface ScreenshotResult {
  canceled: boolean
  dataUrl?: string
}

interface ScreenshotPayload {
  dataUrl: string
  scaleFactor: number
}

interface ActiveScreenshot {
  window: BrowserWindow
  payload: ScreenshotPayload
  resolve: (result: ScreenshotResult) => void
  shouldRestoreMainWindow: boolean
  settled: boolean
}

interface FileDownloadPayload {
  downloadId: string
  fileId: string
  serverOrigin: string
  token: string
  suggestedName: string
}

let activeScreenshot: ActiveScreenshot | null = null

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createMainWindow() {
  // 主窗口保持 renderer sandbox/contextIsolation，所有 native capability 都通过 preload IPC 白名单暴露。
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    title: 'ArtTalk',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting && closeBehavior === 'tray') {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }
}

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

async function captureDisplay(display: Electron.Display): Promise<string> {
  // Capture uses the physical display scale so the screenshot overlay can map selection coordinates precisely.
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
    throw new Error('No screen capture source is available.')
  }
  return source.thumbnail.toDataURL()
}

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

function isScreenshotSender(event: Electron.IpcMainInvokeEvent): boolean {
  return !!activeScreenshot && event.sender === activeScreenshot.window.webContents
}

async function startScreenshot(): Promise<ScreenshotResult> {
  // Screenshot runs in a temporary transparent window and restores the main window only when we hid it for capture.
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
    await delay(150)
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
        preload: join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    screenshotWindow.setAlwaysOnTop(true, 'screen-saver')

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
    console.error('Failed to start screenshot capture:', err)
    return { canceled: true }
  }
}

// IPC handlers are the only native surface exposed to the renderer; keep payloads narrow and serializable.
ipcMain.handle('app:getVersion', () => app.getVersion())
ipcMain.handle('app:getPlatform', () => process.platform)
ipcMain.handle('app:setCloseBehavior', (_event, behavior: 'tray' | 'exit') => {
  closeBehavior = behavior === 'exit' ? 'exit' : 'tray'
  return true
})
ipcMain.handle('app:openExternal', async (_event, url: string) => {
  if (/^https?:\/\//i.test(url)) {
    await shell.openExternal(url)
    return true
  }
  return false
})
ipcMain.handle('notification:setUnreadBadge', (_event, count: number) => {
  updateUnreadBadge(count)
  return true
})
ipcMain.handle('notification:show', (_event, payload: { title?: string; body?: string; conversationId?: string }) => {
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
  if (mainWindow && !mainWindow.isFocused()) {
    mainWindow.flashFrame(true)
  }
  return true
})
ipcMain.handle('messages:upsert', async (_event, userId: string, message: LocalMessageRecord) => {
  // Renderer stores every confirmed/optimistic message so local history survives app restarts.
  await upsertLocalMessage(userId, message)
  return true
})
ipcMain.handle(
  'messages:list',
  (_event, userId: string, conversationId: string, beforeMessageId?: string, pageSize?: number) =>
    listLocalMessages(userId, conversationId, beforeMessageId, pageSize),
)
ipcMain.handle(
  'messages:search',
  (_event, userId: string, conversationId: string, keyword: string, limit?: number) =>
    searchLocalMessages(userId, conversationId, keyword, limit),
)
ipcMain.handle('messages:stats', (_event, userId: string) => getLocalMessageStats(userId))
ipcMain.handle('messages:clear', (_event, userId: string) => clearLocalMessages(userId))
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
    if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('Unsupported protocol')
    downloadUrl = new URL(`/api/files/download/${fileId}`, origin.origin)
  } catch {
    return { canceled: false, success: false, error: 'Invalid server address' }
  }
  const safeName = basename(payload.suggestedName || `file-${fileId}`).replace(/[<>:"/\\|?*]/g, '_')
  const selection = await dialog.showSaveDialog(mainWindow, { defaultPath: safeName })
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
ipcMain.handle('files:cancel-download', (_event, downloadId: string) => {
  const controller = activeFileDownloads.get(String(downloadId || ''))
  controller?.abort()
  return !!controller
})
ipcMain.handle('screenshot:start', () => startScreenshot())
ipcMain.handle('screenshot:getInitialData', (event) => {
  if (!isScreenshotSender(event)) return null
  return activeScreenshot?.payload ?? null
})
ipcMain.handle('screenshot:confirm', (event, dataUrl: string) => {
  if (!isScreenshotSender(event) || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png')) {
    return false
  }
  return finishScreenshot({ canceled: false, dataUrl })
})
ipcMain.handle('screenshot:cancel', (event) => {
  if (!isScreenshotSender(event)) return false
  return finishScreenshot({ canceled: true })
})

app.whenReady().then(() => {
  setupUpdater({
    getMainWindow: () => mainWindow,
    getNativeTransferCount: () => activeFileDownloads.size,
    beforeInstall: () => {
      isQuitting = true
    },
  })
  createMenu()
  createMainWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    } else {
      mainWindow?.show()
    }
  })
})

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => focusMainWindow())
}

app.on('before-quit', () => {
  isQuitting = true
  activeFileDownloads.forEach((controller) => controller.abort())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
