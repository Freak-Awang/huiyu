import http from './index'

export interface Conversation {
  conversationId: string
  type: 'SINGLE' | 'GROUP'
  name: string
  avatar: string
  lastMessage: MessagePreview | null
  memberCount: number
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export interface MessagePreview {
  messageId: string
  senderId: string
  senderName: string
  content: string
  messageType: string
  createdAt: string
}

export function listConversations() {
  return http.get<Conversation[]>('/api/conversations')
}

export function createConversation(data: { type: string; name?: string; memberIds: string[] }) {
  return http.post<Conversation>('/api/conversations', data)
}

export function addMembers(convId: string, userIds: string[]) {
  return http.post(`/api/conversations/${convId}/members`, { userIds })
}

export function removeMember(convId: string, userId: string) {
  return http.delete(`/api/conversations/${convId}/members/${userId}`)
}

export function pinConversation(convId: string, pinned: boolean) {
  return http.put(`/api/conversations/${convId}/pin`, null, { params: { pinned } })
}
