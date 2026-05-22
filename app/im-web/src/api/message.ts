import http from './index'

export interface Message {
  messageId: string
  conversationId: string
  senderId: string
  senderName: string
  senderAvatar: string
  messageType: 'TEXT' | 'IMAGE' | 'FILE'
  content: string
  displayContent: string
  mentions: MessageMention[]
  clientMsgId?: string
  createdAt: string
  status?: string
}

export interface MessageMention {
  userId: string
  nickname: string
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
  const content = raw.content || ''
  const parsedText = parseTextContent(raw.messageType || 'TEXT', content)

  return {
    messageId: String(raw.messageId ?? raw.id ?? ''),
    conversationId: String(raw.conversationId ?? ''),
    senderId: String(raw.senderId ?? ''),
    senderName: raw.senderName || '',
    senderAvatar: raw.senderAvatar || '',
    messageType: raw.messageType || 'TEXT',
    content,
    displayContent: parsedText.text,
    mentions: parsedText.mentions,
    clientMsgId: raw.clientMsgId || undefined,
    createdAt: timestamp,
    status: raw.status || undefined,
  }
}

export function buildTextMessageContent(text: string, mentions: MessageMention[] = []): string {
  return JSON.stringify({
    text,
    mentions: normalizeMentions(mentions),
  })
}

function parseTextContent(messageType: string, content: string): { text: string; mentions: MessageMention[] } {
  if (messageType !== 'TEXT') {
    return { text: content, mentions: [] }
  }
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object' && typeof parsed.text === 'string') {
      return {
        text: parsed.text,
        mentions: normalizeMentions(parsed.mentions),
      }
    }
  } catch {
    // Old text messages were stored as plain strings.
  }
  return { text: content, mentions: [] }
}

function normalizeMentions(raw: unknown): MessageMention[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const result: MessageMention[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const mention = item as { userId?: string | number; nickname?: string }
    const userId = String(mention.userId ?? '')
    const nickname = mention.nickname || ''
    if (!userId || !nickname || seen.has(userId)) continue
    seen.add(userId)
    result.push({ userId, nickname })
  }
  return result
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
