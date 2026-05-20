import http from './index'

export interface Message {
  messageId: string
  conversationId: string
  senderId: string
  senderName: string
  senderAvatar: string
  messageType: 'TEXT' | 'IMAGE' | 'FILE'
  content: string
  clientMsgId?: string
  createdAt: string
}

export function getMessages(convId: string, beforeMessageId?: string, pageSize?: number) {
  return http.get<Message[]>(`/api/messages/${convId}`, {
    params: { beforeMessageId, pageSize: pageSize || 50 },
  })
}

export function markRead(convId: string) {
  return http.post(`/api/messages/read/${convId}`)
}
