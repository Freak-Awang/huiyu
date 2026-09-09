/**
 * Electron 主进程入口
 *
 * 管理原生窗口生命周期、系统托盘、桌面通知、P2P 接收及 IPC 通信。
 * 所有 native 能力通过 preload 脚本的白名单 IPC 暴露给渲染进程，保持 sandbox 隔离。
 * 支持单实例锁，点击关闭按钮最小化到托盘（macOS 除外）。
 */
import { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, shell } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
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
import { registerP2pHandlers } from './p2pNative.js'
import { configureInternalCertificateTrust } from './internalCertificateTrust.js'
import { createWindowModeController, LOGIN_WINDOW_SIZE } from './windowMode.js'
import { listLocalDrafts, saveLocalDraft } from './localDrafts.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** 应用图标路径：开发模式读 public/，生产模式读 Vite 拷贝进 dist/ 的副本 */
function appIconPath(filename = 'app-icon.png') {
  const base = process.env.VITE_DEV_SERVER_URL ? '../public' : '../dist'
  return join(__dirname, base, filename)
}

/** 主窗口实例 */
let mainWindow: BrowserWindow | null = null
let setWindowMode: ReturnType<typeof createWindowModeController> | undefined

/** 系统托盘实例 */
let tray: Tray | null = null

/** 是否正在退出应用（防止 close 事件中重复隐藏窗口） */
let isQuitting = false

/** 关闭按钮行为：tray 最小化到托盘，exit 直接退出 */
let closeBehavior: 'tray' | 'exit' = 'tray'

/** 未读消息计数，用于更新托盘图标和任务栏徽标 */
let unreadCount = 0

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
    ...LOGIN_WINDOW_SIZE,
    minWidth: LOGIN_WINDOW_SIZE.width,
    minHeight: LOGIN_WINDOW_SIZE.height,
    resizable: false,
    maximizable: false,
    title: 'ArtTalk',
    backgroundColor: '#ffffff',
    frame: false,
    icon: appIconPath(),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  setWindowMode = createWindowModeController(mainWindow)

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
ipcMain.handle('window:setMode', (event, mode: unknown) => {
  assertMainWindowSender(event)
  return setWindowMode?.(mode) ?? false
})

ipcMain.handle('window:minimize', (event) => {
  assertMainWindowSender(event)
  mainWindow?.minimize()
  return true
})

ipcMain.handle('window:toggleMaximize', (event) => {
  assertMainWindowSender(event)
  if (!mainWindow || !mainWindow.isMaximizable()) return false
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
ipcMain.handle('notification:show', (event, payload: { title?: string; body?: string; conversationId?: string; silent?: boolean }) => {
  assertMainWindowSender(event)
  const title = payload?.title || 'ArtTalk'
  const body = payload?.body || '收到一条新消息'
  const conversationId = String(payload?.conversationId || '')
  if (Notification.isSupported()) {
    const notification = new Notification({ title, body, silent: !!payload?.silent })
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

ipcMain.handle('drafts:list', (event, userId: string) => {
  assertMainWindowSender(event)
  return listLocalDrafts(userId)
})

ipcMain.handle('drafts:save', (event, userId: string, conversationId: string, draft: Parameters<typeof saveLocalDraft>[2]) => {
  assertMainWindowSender(event)
  return saveLocalDraft(userId, conversationId, draft)
})

const p2pNative = registerP2pHandlers({ assertTrusted: assertMainWindowSender,
  getWindow: () => mainWindow || undefined, getStorageDirectory: getStorageLocation })

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

// Flush durable P2P checkpoints before quitting or installing an update.
let p2pQuitReady = false
let p2pQuitPending = false
app.on('before-quit', (event) => {
  isQuitting = true
  if (p2pQuitReady) return
  event.preventDefault()
  if (p2pQuitPending) return
  p2pQuitPending = true
  void p2pNative.suspendAll().then(async () => {
    p2pQuitReady = true
    if (shouldInstallOnQuit()) await installPendingUpdateOnQuit()
    else app.quit()
  }).catch((error) => {
    p2pQuitPending = false
    isQuitting = false
    dialog.showErrorBox('传输进度尚未保存', String(error?.message || error))
  })
})

// macOS 特殊处理：关闭所有窗口不退出应用（符合 macOS 惯例）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
