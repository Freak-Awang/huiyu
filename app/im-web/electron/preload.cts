/**
 * Preload 脚本（Electron 预加载层，编译为 CommonJS）
 *
 * 在渲染进程沙箱隔离的前提下，通过 contextBridge 向 window 注入类型化的桌面桥接 API。
 * 所有 native 能力通过 ipcRenderer.invoke 调用主进程的 IPC handler，保持安全边界。
 * 暴露两个全局对象：
 * - imDesktop：桌面端通用能力（版本、平台、通知、消息缓存、P2P 接收）
 */
import { contextBridge, ipcRenderer } from 'electron'

const p2pPorts = new Map<string, MessagePort>()
let p2pWriteRequestSequence = 0
const p2pWritePending = new Map<string, {
  receiveId: string
  resolve: (value: { offset: number }) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}>()

ipcRenderer.on('p2p:receive-port', (event, payload: { receiveId?: string }) => {
  const receiveId = String(payload?.receiveId || '')
  const port = event.ports[0]
  if (!receiveId || !port) return
  port.onmessage = (message) => {
    const data = message.data as { requestId?: string; ok?: boolean; offset?: number; error?: string }
    const pending = data.requestId ? p2pWritePending.get(data.requestId) : undefined
    if (!pending || !data.requestId) return
    clearTimeout(pending.timer)
    p2pWritePending.delete(data.requestId)
    if (data.ok) pending.resolve({ offset: Number(data.offset || 0) })
    else pending.reject(new Error(data.error || 'P2P 写入失败'))
  }
  port.start()
  p2pPorts.set(receiveId, port)
})

function closeP2pPort(receiveId: string) {
  p2pPorts.get(receiveId)?.close()
  p2pPorts.delete(receiveId)
  for (const [requestId, pending] of p2pWritePending) {
    if (pending.receiveId !== receiveId) continue
    clearTimeout(pending.timer)
    pending.reject(new Error('P2P 接收任务已关闭'))
    p2pWritePending.delete(requestId)
  }
}

function nextP2pWriteRequestId() {
  p2pWriteRequestSequence = (p2pWriteRequestSequence + 1) % Number.MAX_SAFE_INTEGER
  return `p2p-write-${Date.now()}-${p2pWriteRequestSequence}`
}

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

  /** 清空指定会话的本地消息缓存 */
  clearConversationMessages: (userId: string, conversationId: string) =>
    ipcRenderer.invoke('messages:clear-conversation', userId, conversationId) as Promise<boolean>,

  /** 选择 P2P 附件保存位置并创建受约束的主进程接收会话。 */
  startP2pReceive: (payload: {
    transferId: string
    kind: 'file' | 'folder'
    name: string
    totalSize: number
    fileCount: number
  }) => ipcRenderer.invoke('p2p:receive-start', payload) as Promise<{
    canceled: boolean
    success: boolean
    receiveId?: string
    finalPath?: string
    error?: string
  }>,

  prepareP2pReceive: (receiveId: string, entries: unknown[]) =>
    ipcRenderer.invoke('p2p:receive-prepare', receiveId, entries) as Promise<{
      offsets: Record<string, number>
      finalPath: string
    }>,

  writeP2pChunk: (receiveId: string, fileIndex: number, offset: number, data: ArrayBuffer) => {
    const port = p2pPorts.get(receiveId)
    if (!port) return Promise.reject(new Error('P2P 接收通道不可用'))
    const requestId = nextP2pWriteRequestId()
    return new Promise<{ offset: number }>((resolve, reject) => {
      const timer = setTimeout(() => {
        p2pWritePending.delete(requestId)
        reject(new Error('P2P 写入超时'))
      }, 30_000)
      p2pWritePending.set(requestId, { receiveId, resolve, reject, timer })
      port.postMessage({ type: 'write', requestId, fileIndex, offset, data }, [data])
    })
  },

  finishP2pFile: (receiveId: string, fileIndex: number) =>
    ipcRenderer.invoke('p2p:receive-finish-file', receiveId, fileIndex) as Promise<{
      success: boolean
      offset: number
      sha256: string
    }>,

  commitP2pReceive: async (receiveId: string) => {
    const result = await ipcRenderer.invoke('p2p:receive-commit', receiveId) as {
      success: boolean
      path: string
      transferId: string
    }
    closeP2pPort(receiveId)
    return result
  },

  abortP2pReceive: async (receiveId: string) => {
    const result = await ipcRenderer.invoke('p2p:receive-abort', receiveId) as boolean
    closeP2pPort(receiveId)
    return result
  },

  openP2pResult: (transferId: string) =>
    ipcRenderer.invoke('p2p:open-result', transferId) as Promise<{
      success: boolean
      path?: string
      error?: string
    }>,

  revealP2pResult: (transferId: string) =>
    ipcRenderer.invoke('p2p:reveal-result', transferId) as Promise<{
      success: boolean
      path?: string
      error?: string
    }>,

  /** 初始化在线更新（登录成功后调用，启动 30 秒后首次检测） */
  initUpdate: (payload: { serverOrigin: string; token: string; channel?: string }) =>
    ipcRenderer.invoke('update:init', payload) as Promise<{ success: boolean; error?: string }>,

  /** 停止在线更新检测（登出时调用） */
  stopUpdate: () => ipcRenderer.invoke('update:stop') as Promise<boolean>,

  /** 手动触发一次更新检查，返回最新状态 */
  checkUpdateNow: () =>
    ipcRenderer.invoke('update:check-now') as Promise<{
      status: string
      updateType?: string
      targetVersion?: string
      changelog?: string[]
      received?: number
      total?: number
      fileName?: string
      error?: string
    }>,

  /** 获取当前更新状态 */
  getUpdateState: () =>
    ipcRenderer.invoke('update:get-state') as Promise<{
      status: string
      updateType?: string
      targetVersion?: string
      changelog?: string[]
      received?: number
      total?: number
      fileName?: string
      error?: string
    }>,

  /** 设置是否在退出应用时自动安装已就绪的更新 */
  setInstallOnQuit: (enabled: boolean) =>
    ipcRenderer.invoke('update:set-install-on-quit', enabled) as Promise<boolean>,

  /** 立即退出并安装已下载的更新 */
  quitAndInstallUpdate: () =>
    ipcRenderer.invoke('update:quit-and-install') as Promise<{ success: boolean; error?: string }>,

  /** 监听更新状态变化，返回取消监听的函数 */
  onUpdateStateChanged: (handler: (state: {
    status: string
    updateType?: string
    targetVersion?: string
    changelog?: string[]
    received?: number
    total?: number
    fileName?: string
    error?: string
  }) => void) => {
    const listener = (_event: unknown, state: Parameters<typeof handler>[0]) => handler(state)
    ipcRenderer.on('update:state-changed', listener)
    return () => ipcRenderer.removeListener('update:state-changed', listener)
  },

  /** 自定义窗口控制：最小化、最大/恢复、关闭、查询当前最大化状态 */
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize') as Promise<boolean>,
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize') as Promise<boolean>,
    close: () => ipcRenderer.invoke('window:close') as Promise<boolean>,
    isMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
    /** 窗口抖动（振屏）：主进程在原位置附近快速小幅移动窗口 */
    shake: () => ipcRenderer.invoke('window:shake') as Promise<boolean>,
    /** 监听主进程广播的最大化状态变化，返回取消监听的函数 */
    onMaximizeChanged: (handler: (maximized: boolean) => void) => {
      const listener = (_event: unknown, maximized: boolean) => handler(maximized)
      ipcRenderer.on('window:maximize-changed', listener)
      return () => ipcRenderer.removeListener('window:maximize-changed', listener)
    },
  },
})
