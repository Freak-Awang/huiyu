// Intent: desktop.d declares desktop bridge types consumed by the renderer process.
export {}

declare global {
  interface Window {
    imDesktop?: {
      getVersion: () => Promise<string>
      getPlatform: () => Promise<string>
      openExternal: (url: string) => Promise<boolean>
      setCloseBehavior?: (behavior: 'tray' | 'exit') => Promise<boolean>
      showMessageNotification?: (payload: {
        title: string
        body: string
        conversationId: string
      }) => Promise<boolean>
      setUnreadBadge?: (count: number) => Promise<boolean>
      onNotificationOpenConversation?: (handler: (conversationId: string) => void) => () => void
      startScreenshot?: () => Promise<{ canceled: boolean; dataUrl?: string }>
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
    }
    imScreenshot?: {
      getInitialData: () => Promise<{ dataUrl: string; scaleFactor: number } | null>
      confirm: (dataUrl: string) => Promise<boolean>
      cancel: () => Promise<boolean>
    }
  }
}
