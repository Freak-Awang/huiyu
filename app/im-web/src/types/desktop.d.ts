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
    }
    imScreenshot?: {
      getInitialData: () => Promise<{ dataUrl: string; scaleFactor: number } | null>
      confirm: (dataUrl: string) => Promise<boolean>
      cancel: () => Promise<boolean>
    }
  }
}
