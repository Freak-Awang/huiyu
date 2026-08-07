/**
 * desktop.d.ts - Electron桌面桥接层类型声明
 * 
 * 为渲染进程提供 preload.cts 通过 contextBridge 暴露的 imDesktop
 * API 类型定义。涵盖窗口管理、消息本地存储、文件下载、自动更新等功能。
 */
export {}

/** 自动更新状态枚举 */
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

/** 桌面端自动更新状态快照，由 updater.ts 维护并通过 IPC 暴露给渲染进程 */
export interface DesktopUpdateState {
  status: UpdateStatus
  currentVersion: string
  releaseId?: number
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

/** 
 * 扩展全局 Window 接口，声明 preload 桥接层暴露的 Electron 主进程能力
 * - imDesktop: 主进程通用API（窗口、通知、消息存储、文件下载、更新等）
 */
declare global {
  interface Window {
    imDesktop?: {
      getVersion: () => Promise<string>
      getPlatform: () => Promise<string>
      openExternal: (url: string) => Promise<boolean>
      setCloseBehavior?: (behavior: 'tray' | 'exit') => Promise<boolean>
      getStorageLocation?: () => Promise<string>
      chooseStorageLocation?: () => Promise<{ canceled: boolean; path?: string }>
      openStorageLocation?: () => Promise<{ success: boolean; error?: string }>
      showMessageNotification?: (payload: {
        title: string
        body: string
        conversationId: string
      }) => Promise<boolean>
      setUnreadBadge?: (count: number) => Promise<boolean>
      onNotificationOpenConversation?: (handler: (conversationId: string) => void) => () => void
      upsertMessage: (userId: string, message: unknown) => Promise<boolean>
      listMessages: (
        userId: string,
        conversationId: string,
        beforeMessageId?: string,
        pageSize?: number,
      ) => Promise<unknown[]>
      searchMessages: (
        userId: string,
        conversationId: string,
        keyword: string,
        limit?: number,
      ) => Promise<unknown[]>
      getMessageStats?: (userId: string) => Promise<{
        conversationCount: number
        messageCount: number
        cacheSize: number
      }>
      clearMessages?: (userId: string) => Promise<boolean>
      clearConversationMessages?: (userId: string, conversationId: string) => Promise<boolean>
      downloadFile?: (payload: {
        downloadId: string
        fileId: string
        serverOrigin: string
        token: string
        suggestedName: string
      }) => Promise<{ canceled: boolean; success: boolean; path?: string; error?: string }>
      cancelFileDownload?: (downloadId: string) => Promise<boolean>
      onFileDownloadProgress?: (handler: (progress: {
        downloadId: string
        received: number
        total: number
        state: string
        error?: string
      }) => void) => () => void
      configureUpdater?: (configuration: {
        serverOrigin: string
        token?: string
        channel?: 'stable' | 'beta'
      }) => Promise<DesktopUpdateState>
      getUpdateState?: () => Promise<DesktopUpdateState>
      checkForUpdates?: () => Promise<DesktopUpdateState>
      downloadUpdate?: () => Promise<DesktopUpdateState>
      installUpdate?: () => Promise<boolean>
      setUpdateTransferCount?: (count: number) => Promise<boolean>
      onUpdateStateChanged?: (handler: (state: DesktopUpdateState) => void) => () => void
      window?: {
        minimize: () => Promise<boolean>
        toggleMaximize: () => Promise<boolean>
        close: () => Promise<boolean>
        isMaximized: () => Promise<boolean>
        onMaximizeChanged?: (handler: (maximized: boolean) => void) => () => void
      }
    }
  }
}
