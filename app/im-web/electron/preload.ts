import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('imDesktop', {
  getVersion: () => ipcRenderer.invoke('app:getVersion') as Promise<string>,
  getPlatform: () => ipcRenderer.invoke('app:getPlatform') as Promise<string>,
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url) as Promise<boolean>,
  upsertMessage: (userId: string, message: unknown) =>
    ipcRenderer.invoke('messages:upsert', userId, message) as Promise<boolean>,
  listMessages: (userId: string, conversationId: string, beforeMessageId?: string, pageSize?: number) =>
    ipcRenderer.invoke('messages:list', userId, conversationId, beforeMessageId, pageSize) as Promise<unknown[]>,
  searchMessages: (userId: string, conversationId: string, keyword: string, limit?: number) =>
    ipcRenderer.invoke('messages:search', userId, conversationId, keyword, limit) as Promise<unknown[]>,
})
