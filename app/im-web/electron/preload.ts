// Intent: Preload exposes a narrow, typed desktop bridge while keeping renderer isolation enabled.
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('imDesktop', {
  getVersion: () => ipcRenderer.invoke('app:getVersion') as Promise<string>,
  getPlatform: () => ipcRenderer.invoke('app:getPlatform') as Promise<string>,
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url) as Promise<boolean>,
  setCloseBehavior: (behavior: 'tray' | 'exit') =>
    ipcRenderer.invoke('app:setCloseBehavior', behavior) as Promise<boolean>,
  showMessageNotification: (payload: { title: string; body: string; conversationId: string }) =>
    ipcRenderer.invoke('notification:show', payload) as Promise<boolean>,
  setUnreadBadge: (count: number) => ipcRenderer.invoke('notification:setUnreadBadge', count) as Promise<boolean>,
  onNotificationOpenConversation: (handler: (conversationId: string) => void) => {
    const listener = (_event: unknown, conversationId: string) => handler(conversationId)
    ipcRenderer.on('notification:open-conversation', listener)
    return () => ipcRenderer.removeListener('notification:open-conversation', listener)
  },
  startScreenshot: () =>
    ipcRenderer.invoke('screenshot:start') as Promise<{ canceled: boolean; dataUrl?: string }>,
  upsertMessage: (userId: string, message: unknown) =>
    ipcRenderer.invoke('messages:upsert', userId, message) as Promise<boolean>,
  listMessages: (userId: string, conversationId: string, beforeMessageId?: string, pageSize?: number) =>
    ipcRenderer.invoke('messages:list', userId, conversationId, beforeMessageId, pageSize) as Promise<unknown[]>,
  searchMessages: (userId: string, conversationId: string, keyword: string, limit?: number) =>
    ipcRenderer.invoke('messages:search', userId, conversationId, keyword, limit) as Promise<unknown[]>,
  getMessageStats: (userId: string) =>
    ipcRenderer.invoke('messages:stats', userId) as Promise<{
      conversationCount: number
      messageCount: number
      cacheSize: number
    }>,
  clearMessages: (userId: string) => ipcRenderer.invoke('messages:clear', userId) as Promise<boolean>,
})

contextBridge.exposeInMainWorld('imScreenshot', {
  getInitialData: () =>
    ipcRenderer.invoke('screenshot:getInitialData') as Promise<{ dataUrl: string; scaleFactor: number } | null>,
  confirm: (dataUrl: string) => ipcRenderer.invoke('screenshot:confirm', dataUrl) as Promise<boolean>,
  cancel: () => ipcRenderer.invoke('screenshot:cancel') as Promise<boolean>,
})
