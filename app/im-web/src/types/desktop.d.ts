/**
 * desktop.d.ts - Electron桌面桥接层类型声明
 * 
 * 为渲染进程提供 preload.cts 通过 contextBridge 暴露的 imDesktop
 * API 类型定义。涵盖窗口管理、消息本地存储、P2P 接收等功能。
 */
export interface NativeP2pManifestEntry {
  index: number
  path: string
  name: string
  size: number
  contentType: string
  sha256: string
}

export interface NativeP2pManifest {
  version: 1 | 2
  kind: 'file' | 'folder'
  name: string
  totalSize: number
  fileCount: number
  directories?: string[]
  files: NativeP2pManifestEntry[]
  manifestSha256: string
}

export interface NativeP2pAttachmentSummary {
  version: 1 | 2
  transferMode: 'p2p_lan'
  transferId: string
  kind: 'file' | 'folder'
  name: string
  totalSize: number
  fileCount: number
  directoryCount?: number
  sha256?: string
  manifestSha256?: string
  fileName?: string
  fileSize?: number
  folderName?: string
}

/** Full native record. Receiver paths, manifests and durable checkpoints are main-process owned. */
export interface NativeP2pTaskRecord {
  taskId: string
  transferId: string
  direction: 'send' | 'receive'
  status: string
  name: string
  kind: 'file' | 'folder'
  conversationId: string
  messageId: string
  totalSize: number
  totalBytes: number
  transferredBytes: number
  progress: number
  fileCount: number
  directoryCount: number
  draftId?: string
  sourceId?: string
  receiveId?: string
  temporaryPath?: string
  finalPath?: string
  localPath?: string
  prepared?: boolean
  offsets?: Record<string, number>
  checkpoints?: Record<string, Array<{ offset: number; sha256: string }>>
  verified?: number[]
  phase?: string
  pauseReason?: string
  desiredState?: 'running' | 'paused'
  error?: string
  cleanupPending?: boolean
  cleanupError?: string
  routeId?: string
  currentFile?: string
  completedFiles?: number
  speedBytesPerSecond?: number
  etaSeconds?: number
  pendingControls?: Array<{ cmd: string; data: Record<string, unknown> }>
  shareState?: string
  content?: NativeP2pAttachmentSummary
  manifest?: NativeP2pManifest
  createdAt?: number
  updatedAt?: number
}

export interface NativeP2pSourceDescriptor {
  sourceId: string
  kind: 'file' | 'folder'
  name: string
  totalSize: number
  fileCount: number
  directoryCount: number
}



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
      listDrafts?: (userId: string) => Promise<Record<string, import('../stores/conversationDrafts').ConversationDraft>>
      saveDraft?: (userId: string, conversationId: string, draft: import('../stores/conversationDrafts').ConversationDraft | null) => Promise<boolean>
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
        silent?: boolean
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
      setP2pAccount?: (userId: string | null) => Promise<NativeP2pTaskRecord[]>
      listP2pTasks?: () => Promise<NativeP2pTaskRecord[]>
      saveP2pTask?: (task: Partial<NativeP2pTaskRecord> & { transferId: string; direction: 'send' | 'receive' }) => Promise<NativeP2pTaskRecord>
      deleteP2pTask?: (taskId: string) => Promise<boolean>
      retryP2pCleanup?: (taskId: string) => Promise<{ success: boolean; cleanupPending: boolean; error?: string }>
      pickP2pSources?: (kind: 'file' | 'folder') => Promise<{ canceled: boolean; sources: NativeP2pSourceDescriptor[] }>
      importP2pSources?: (files: File[]) => Promise<{ canceled: boolean; sources: NativeP2pSourceDescriptor[] }>
      prepareP2pSource?: (sourceId: string) => Promise<{ source: NativeP2pSourceDescriptor; manifest: NativeP2pManifest }>
      validateP2pSource?: (sourceId: string) => Promise<NativeP2pSourceDescriptor>
      cancelP2pSourcePreparation?: (sourceId: string) => Promise<boolean>
      readP2pSourceChunk?: (sourceId: string, fileIndex: number, offset: number, length: number) => Promise<ArrayBuffer>
      locateP2pSource?: (sourceId: string) => Promise<{ canceled: boolean; source?: NativeP2pSourceDescriptor; manifest?: NativeP2pManifest }>
      onP2pSourceProgress?: (handler: (event: { sourceId: string; progress: number; phase: string }) => void) => () => void
      onP2pReceiveProgress?: (handler: (event: { receiveId: string; phase: 'verifying' | 'committing'; processedBytes: number; totalBytes?: number; fileIndex?: number; sequence?: number }) => void) => () => void
      startP2pReceive?: (payload: {
        transferId: string
        kind: 'file' | 'folder'
        name: string
        totalSize: number
        fileCount: number
        directoryCount?: number
        version?: 1 | 2
        messageId?: string
        conversationId?: string
        sha256?: string
        manifestSha256?: string
        transferMode?: 'p2p_lan'
      }) => Promise<{
        canceled: boolean
        success: boolean
        taskId?: string
        receiveId?: string
        finalPath?: string
        error?: string
      }>
      prepareP2pReceive?: (receiveId: string, manifest: NativeP2pManifest) => Promise<{ offsets: Record<string, number>; finalPath: string }>
      restoreP2pReceive?: (receiveId: string) => Promise<{ offsets: Record<string, number>; finalPath: string; receiveId?: string; completed?: boolean; status?: string }>
      suspendP2pReceive?: (receiveId: string, reason?: string) => Promise<boolean>
      writeP2pChunk?: (receiveId: string, fileIndex: number, offset: number, data: ArrayBuffer) => Promise<{ offset: number; durableOffset?: number }>
      finishP2pFile?: (receiveId: string, fileIndex: number) => Promise<{ success: boolean; offset: number; sha256: string }>
      commitP2pReceive?: (receiveId: string) => Promise<{ success: boolean; path: string; transferId: string }>
      abortP2pReceive?: (receiveId: string) => Promise<boolean>
      openP2pResult?: (transferIdOrTaskId: string) => Promise<{ success: boolean; path?: string; error?: string }>
      revealP2pResult?: (transferIdOrTaskId: string) => Promise<{ success: boolean; path?: string; error?: string }>
      locateP2pResult?: (transferIdOrTaskId: string) => Promise<{ canceled: boolean; success: boolean; path?: string; error?: string }>
      changeP2pReceiveDestination?: (receiveId: string) => Promise<{ canceled: boolean; success: boolean; finalPath?: string; error?: string }>
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
      cancelAutoInstall?: () => Promise<boolean>
      onUpdateStateChanged?: (handler: (state: DesktopUpdateState) => void) => () => void
      window?: {
        setMode?: (mode: 'login' | 'chat') => Promise<boolean>
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
