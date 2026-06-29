// Intent: conversation wraps backend API calls so views and stores do not depend on raw HTTP details.
import http from './index'

export interface Conversation {
  conversationId: string
  type: 'SINGLE' | 'GROUP'
  name: string
  avatar: string
  lastMessage: MessagePreview | null
  announcement?: string
  announcementUpdatedBy?: string
  announcementUpdatedAt?: string
  members?: ConversationMember[]
  memberCount: number
  pinned: boolean
  createdAt: string
  updatedAt: string
  unreadCount: number
  mentionUnreadCount: number
  muted: boolean
}

export interface ConversationMember {
  userId: string
  nickname?: string
  avatar?: string
  signature?: string
  role?: string
}

export interface MessagePreview {
  messageId: string
  senderId: string
  senderName: string
  content: string
  messageType: string
  createdAt: string
}

export interface RawConversation {
  id?: number | string
  conversationId?: number | string
  type?: number | string
  name?: string | null
  avatar?: string | null
  lastMessage?: string | MessagePreview | null
  announcement?: string | null
  announcementUpdatedBy?: number | string | null
  announcementUpdatedAt?: string | null
  lastMessageTime?: string | null
  unreadCount?: number | null
  mentionUnreadCount?: number | null
  isPinned?: number | boolean | null
  isMuted?: number | boolean | null
  muted?: boolean | null
  pinned?: boolean | null
  memberCount?: number | null
  members?: Array<ConversationMember & { userId: number | string }>
  createTime?: string | null
  updateTime?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export type CreateConversationParams =
  | { type: 'SINGLE'; targetUserId: string | number }
  | { type: 'GROUP'; name: string; memberIds: Array<string | number> }

export function normalizeConversation(raw: RawConversation): Conversation {
  const conversationId = String(raw.conversationId ?? raw.id ?? '')
  const type = raw.type === 1 || raw.type === '1' || raw.type === 'SINGLE' ? 'SINGLE' : 'GROUP'
  const lastMessageTime = raw.lastMessageTime || raw.updatedAt || raw.updateTime || raw.createdAt || raw.createTime || ''
  const rawLastMessage = raw.lastMessage
  const lastMessage =
    typeof rawLastMessage === 'string'
      ? {
          messageId: '',
          senderId: '',
          senderName: '',
          content: rawLastMessage,
          messageType: 'TEXT',
          createdAt: lastMessageTime,
        }
      : rawLastMessage || null

  const members =
    raw.members?.map((member) => ({
      ...member,
      userId: String(member.userId),
    })) || []

  return {
    conversationId,
    type,
    name: raw.name || '',
    avatar: raw.avatar || '',
    announcement: raw.announcement || '',
    announcementUpdatedBy: raw.announcementUpdatedBy != null ? String(raw.announcementUpdatedBy) : undefined,
    announcementUpdatedAt: raw.announcementUpdatedAt || '',
    lastMessage,
    members,
    memberCount: raw.memberCount ?? members.length,
    pinned: Boolean(raw.pinned ?? raw.isPinned),
    createdAt: raw.createdAt || raw.createTime || '',
    updatedAt: raw.updatedAt || raw.updateTime || lastMessageTime || '',
    unreadCount: raw.unreadCount || 0,
    mentionUnreadCount: raw.mentionUnreadCount || 0,
    muted: Boolean(raw.muted ?? raw.isMuted),
  }
}

export function listConversations() {
  return http.get<RawConversation[]>('/api/conversations').then((res) => ({
    ...res,
    data: (res.data || []).map(normalizeConversation),
  }))
}

export function getConversation(conversationId: string) {
  return http.get<RawConversation>(`/api/conversations/${conversationId}`).then((res) => ({
    ...res,
    data: normalizeConversation(res.data),
  }))
}

export function createConversation(data: CreateConversationParams) {
  const payload =
    data.type === 'SINGLE'
      ? { type: 1, targetUserId: Number(data.targetUserId) }
      : {
          type: 2,
          name: data.name,
          memberIds: data.memberIds.map((id) => Number(id)),
        }

  return http.post<RawConversation>('/api/conversations', payload).then((res) => ({
    ...res,
    data: normalizeConversation(res.data),
  }))
}

export function addMembers(convId: string, userIds: string[]) {
  return http.post(`/api/conversations/${convId}/members`, {
    userIds: userIds.map((id) => Number(id)),
  })
}

export function removeMember(convId: string, userId: string) {
  return http.delete(`/api/conversations/${convId}/members/${userId}`)
}

export function pinConversation(convId: string, pinned: boolean) {
  return http.put(`/api/conversations/${convId}/pin`, null, { params: { pinned } })
}

export function muteConversation(convId: string, muted: boolean) {
  return http.put(`/api/conversations/${convId}/mute`, null, { params: { muted } })
}

export function updateConversationSettings(
  convId: string,
  data: { name?: string; announcement?: string },
) {
  return http.put<RawConversation>(`/api/conversations/${convId}/settings`, data).then((res) => ({
    ...res,
    data: normalizeConversation(res.data),
  }))
}

export function updateMemberRole(convId: string, userId: string, role: 'admin' | 'member') {
  return http.put<RawConversation>(`/api/conversations/${convId}/members/${userId}/role`, { role }).then((res) => ({
    ...res,
    data: normalizeConversation(res.data),
  }))
}
