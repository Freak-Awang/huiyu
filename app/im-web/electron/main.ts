import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow, Menu, Tray, desktopCapturer, ipcMain, nativeImage, screen, shell } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  listLocalMessages,
  clearLocalMessages,
  getLocalMessageStats,
  searchLocalMessages,
  upsertLocalMessage,
  type LocalMessageRecord,
} from './localMessages.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

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

let activeScreenshot: ActiveScreenshot | null = null

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    title: 'Enterprise IM',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
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
  tray.setToolTip('Enterprise IM')
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

ipcMain.handle('app:getVersion', () => app.getVersion())
ipcMain.handle('app:getPlatform', () => process.platform)
ipcMain.handle('app:openExternal', async (_event, url: string) => {
  if (/^https?:\/\//i.test(url)) {
    await shell.openExternal(url)
    return true
  }
  return false
})
ipcMain.handle('messages:upsert', async (_event, userId: string, message: LocalMessageRecord) => {
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
  createMenu()
  createMainWindow()
  createTray()

  if (app.isPackaged) {
  autoUpdater.checkForUpdatesAndNotify()
}

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    } else {
      mainWindow?.show()
    }
  })
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
