/**
 * desktop.d.ts - Electron桌面桥接层类型声明
 * 
 * 为渲染进程提供 preload.cts 通过 contextBridge 暴露的 imDesktop
 * API 类型定义。涵盖窗口管理、消息本地存储、文件下载等功能。
 */
export {}

/** 桌面端在线更新状态快照 */
interface DesktopUpdateState {
  status: string
  updateType?: string
  targetVersion?: string
  changelog?: string[]
  received?: number
  total?: number
  fileName?: string
  error?: string
}

/** 
 * 扩展全局 Window 接口，声明 preload 桥接层暴露的 Electron 主进程能力
 * - imDesktop: 主进程通用API（窗口、通知、消息存储、文件下载等）
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
      startP2pReceive?: (payload: {
        transferId: string
        kind: 'file' | 'folder'
        name: string
        totalSize: number
        fileCount: number
      }) => Promise<{
        canceled: boolean
        success: boolean
        receiveId?: string
        finalPath?: string
        error?: string
      }>
      prepareP2pReceive?: (receiveId: string, entries: Array<{
        index: number
        path: string
        name: string
        size: number
        contentType: string
        sha256: string
      }>) => Promise<{ offsets: Record<string, number>; finalPath: string }>
      writeP2pChunk?: (
        receiveId: string,
        fileIndex: number,
        offset: number,
        data: ArrayBuffer,
      ) => Promise<{ offset: number }>
      finishP2pFile?: (
        receiveId: string,
        fileIndex: number,
      ) => Promise<{ success: boolean; offset: number; sha256: string }>
      commitP2pReceive?: (
        receiveId: string,
      ) => Promise<{ success: boolean; path: string; transferId: string }>
      abortP2pReceive?: (receiveId: string) => Promise<boolean>
      openP2pResult?: (transferId: string) => Promise<{ success: boolean; path?: string; error?: string }>
      revealP2pResult?: (transferId: string) => Promise<{ success: boolean; path?: string; error?: string }>
      initUpdate?: (payload: {
        serverOrigin: string
        token: string
        channel?: string
      }) => Promise<{ success: boolean; error?: string }>
      stopUpdate?: () => Promise<boolean>
      checkUpdateNow?: () => Promise<DesktopUpdateState>
      getUpdateState?: () => Promise<DesktopUpdateState>
      setInstallOnQuit?: (enabled: boolean) => Promise<boolean>
      quitAndInstallUpdate?: () => Promise<{ success: boolean; error?: string }>
      onUpdateStateChanged?: (handler: (state: DesktopUpdateState) => void) => () => void
      window?: {
        minimize: () => Promise<boolean>
        toggleMaximize: () => Promise<boolean>
        close: () => Promise<boolean>
        isMaximized: () => Promise<boolean>
        shake?: () => Promise<boolean>
        onMaximizeChanged?: (handler: (maximized: boolean) => void) => () => void
      }
    }
  }
}
