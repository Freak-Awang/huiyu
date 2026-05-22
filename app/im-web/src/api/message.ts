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
  status?: string
}

export interface MessagePage {
  records: Message[]
  total: number
  page: number
  pageSize: number
}

export interface RawMessage {
  id?: number | string
  messageId?: number | string
  conversationId?: number | string
  senderId?: number | string
  senderName?: string | null
  senderAvatar?: string | null
  messageType?: 'TEXT' | 'IMAGE' | 'FILE'
  content?: string | null
  clientMsgId?: string | null
  createTime?: string | null
  createdAt?: string | null
  timestamp?: number | string | null
  status?: string | null
}

interface RawMessagePage {
  data?: RawMessage[]
  records?: RawMessage[]
  total?: number
  page?: number
  pageSize?: number
}

export function normalizeMessage(raw: RawMessage): Message {
  const timestamp =
    raw.createdAt ||
    raw.createTime ||
    (raw.timestamp ? new Date(Number(raw.timestamp)).toISOString() : '')

  return {
    messageId: String(raw.messageId ?? raw.id ?? ''),
    conversationId: String(raw.conversationId ?? ''),
    senderId: String(raw.senderId ?? ''),
    senderName: raw.senderName || '',
    senderAvatar: raw.senderAvatar || '',
    messageType: raw.messageType || 'TEXT',
    content: raw.content || '',
    clientMsgId: raw.clientMsgId || undefined,
    createdAt: timestamp,
    status: raw.status || undefined,
  }
}

export function getMessages(convId: string, beforeMessageId?: string, pageSize?: number) {
  return http.get<RawMessagePage>(`/api/messages/${convId}`, {
    params: { beforeMessageId, pageSize: pageSize || 50 },
  }).then((res) => {
    const page = res.data || {}
    const records = page.records || page.data || []
    return {
      ...res,
      data: {
        records: records.map(normalizeMessage),
        total: page.total || 0,
        page: page.page || 1,
        pageSize: page.pageSize || pageSize || 50,
      } satisfies MessagePage,
    }
  })
}

export function markRead(convId: string) {
  return http.post(`/api/messages/read/${convId}`)
}
