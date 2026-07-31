/**
 * Preload 脚本（Electron 预加载层，编译为 CommonJS）
 *
 * 在渲染进程沙箱隔离的前提下，通过 contextBridge 向 window 注入类型化的桌面桥接 API。
 * 所有 native 能力通过 ipcRenderer.invoke 调用主进程的 IPC handler，保持安全边界。
 * 暴露两个全局对象：
 * - imDesktop：桌面端通用能力（版本、平台、通知、消息缓存、文件下载、自动更新）
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('imDesktop', {
  /** 获取应用版本号 */
  getVersion: () => ipcRenderer.invoke('app:getVersion') as Promise<string>,

  /** 获取当前操作系统平台（win32/darwin/linux） */
  getPlatform: () => ipcRenderer.invoke('app:getPlatform') as Promise<string>,

  /** 通过系统默认浏览器打开外链 */
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url) as Promise<boolean>,

  /** 设置关闭按钮行为：tray（最小化到托盘）或 exit（直接退出） */
  setCloseBehavior: (behavior: 'tray' | 'exit') =>
    ipcRenderer.invoke('app:setCloseBehavior', behavior) as Promise<boolean>,

  /** 获取文件默认存储目录 */
  getStorageLocation: () => ipcRenderer.invoke('storage:get-location') as Promise<string>,

  /** 使用系统目录选择器更改文件默认存储目录 */
  chooseStorageLocation: () =>
    ipcRenderer.invoke('storage:choose-location') as Promise<{ canceled: boolean; path?: string }>,

  /** 使用系统文件管理器打开当前存储目录 */
  openStorageLocation: () =>
    ipcRenderer.invoke('storage:open-location') as Promise<{ success: boolean; error?: string }>,

  /** 弹出桌面通知，点击后跳转到对应会话 */
  showMessageNotification: (payload: { title: string; body: string; conversationId: string }) =>
    ipcRenderer.invoke('notification:show', payload) as Promise<boolean>,

  /** 更新未读消息徽标 */
  setUnreadBadge: (count: number) => ipcRenderer.invoke('notification:setUnreadBadge', count) as Promise<boolean>,

  /** 监听通知点击事件，返回取消监听的函数 */
  onNotificationOpenConversation: (handler: (conversationId: string) => void) => {
    const listener = (_event: unknown, conversationId: string) => handler(conversationId)
    ipcRenderer.on('notification:open-conversation', listener)
    return () => ipcRenderer.removeListener('notification:open-conversation', listener)
  },

  /** 保存消息到本地加密缓存 */
  upsertMessage: (userId: string, message: unknown) =>
    ipcRenderer.invoke('messages:upsert', userId, message) as Promise<boolean>,

  /** 分页查询本地消息历史 */
  listMessages: (userId: string, conversationId: string, beforeMessageId?: string, pageSize?: number) =>
    ipcRenderer.invoke('messages:list', userId, conversationId, beforeMessageId, pageSize) as Promise<unknown[]>,

  /** 搜索本地消息 */
  searchMessages: (userId: string, conversationId: string, keyword: string, limit?: number) =>
    ipcRenderer.invoke('messages:search', userId, conversationId, keyword, limit) as Promise<unknown[]>,

  /** 获取本地消息缓存统计 */
  getMessageStats: (userId: string) =>
    ipcRenderer.invoke('messages:stats', userId) as Promise<{
      conversationCount: number
      messageCount: number
      cacheSize: number
    }>,

  /** 清空本地消息缓存 */
  clearMessages: (userId: string) => ipcRenderer.invoke('messages:clear', userId) as Promise<boolean>,

  /** 通过 Electron 原生对话框下载文件，支持进度回传和取消 */
  downloadFile: (payload: {
    downloadId: string
    fileId: string
    serverOrigin: string
    token: string
    suggestedName: string
  }) => ipcRenderer.invoke('files:download', payload) as Promise<{
    canceled: boolean
    success: boolean
    path?: string
    error?: string
  }>,

  /** 取消文件下载 */
  cancelFileDownload: (downloadId: string) =>
    ipcRenderer.invoke('files:cancel-download', downloadId) as Promise<boolean>,

  /** 监听文件下载进度，返回取消监听的函数 */
  onFileDownloadProgress: (handler: (progress: {
    downloadId: string
    received: number
    total: number
    state: string
    error?: string
  }) => void) => {
    const listener = (_event: unknown, progress: Parameters<typeof handler>[0]) => handler(progress)
    ipcRenderer.on('files:download-progress', listener)
    return () => ipcRenderer.removeListener('files:download-progress', listener)
  },

  /** 配置自动更新服务器 */
  configureUpdater: (configuration: { serverOrigin: string; token?: string; channel?: 'stable' | 'beta' }) =>
    ipcRenderer.invoke('updater:configure', configuration),

  /** 获取当前更新状态 */
  getUpdateState: () => ipcRenderer.invoke('updater:get-state'),

  /** 手动检查更新 */
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),

  /** 下载已发现的更新 */
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),

  /** 安装已下载的更新（等待传输任务完成后执行） */
  installUpdate: () => ipcRenderer.invoke('updater:install') as Promise<boolean>,

  /** 设置渲染进程传输任务数（阻止更新安装的计数器） */
  setUpdateTransferCount: (count: number) =>
    ipcRenderer.invoke('updater:set-transfer-count', count) as Promise<boolean>,

  /** 监听更新状态变化，返回取消监听的函数 */
  onUpdateStateChanged: (handler: (state: unknown) => void) => {
    const listener = (_event: unknown, state: unknown) => handler(state)
    ipcRenderer.on('updater:state-changed', listener)
    return () => ipcRenderer.removeListener('updater:state-changed', listener)
  },

  /** 自定义窗口控制：最小化、最大/恢复、关闭、查询当前最大化状态 */
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize') as Promise<boolean>,
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize') as Promise<boolean>,
    close: () => ipcRenderer.invoke('window:close') as Promise<boolean>,
    isMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
    /** 监听主进程广播的最大化状态变化，返回取消监听的函数 */
    onMaximizeChanged: (handler: (maximized: boolean) => void) => {
      const listener = (_event: unknown, maximized: boolean) => handler(maximized)
      ipcRenderer.on('window:maximize-changed', listener)
      return () => ipcRenderer.removeListener('window:maximize-changed', listener)
    },
  },
})
