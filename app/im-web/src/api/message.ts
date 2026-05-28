import http from './index'

export interface Message {
  messageId: string
  conversationId: string
  senderId: string
  senderName: string
  senderAvatar: string
  messageType: 'TEXT' | 'IMAGE' | 'FILE' | 'STICKER'
  content: string
  displayContent: string
  mentions: MessageMention[]
  clientMsgId?: string
  createdAt: string
  status?: MessageStatus
  replyTo?: MessageReply | null
  readCount: number
  recipientCount: number
  readStatus: number
  readTime?: string
}

export type MessageStatus = 'SENT' | 'SENDING' | 'FAILED' | 'RECALLED' | string
export type MessageMentionType = 'user' | 'all'

export const MESSAGE_MENTION_ALL_ID = '__ALL__'

export interface MessageMention {
  type?: MessageMentionType
  userId: string
  nickname: string
}

export function isAllMention(mention: MessageMention): boolean {
  return mention.type === 'all' || mention.userId === MESSAGE_MENTION_ALL_ID
}

export interface MessageReply {
  messageId: string
  senderName: string
  text: string
}

export interface MessageReadReceipt {
  messageId: string
  readCount: number
  recipientCount: number
  readStatus: number
  readTime?: string
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
  messageType?: 'TEXT' | 'IMAGE' | 'FILE' | 'STICKER'
  content?: string | null
  clientMsgId?: string | null
  createTime?: string | null
  createdAt?: string | null
  timestamp?: number | string | null
  status?: string | null
  readCount?: number | null
  recipientCount?: number | null
  readStatus?: number | boolean | null
  readTime?: string | null
}

interface RawMessagePage {
  data?: RawMessage[]
  records?: RawMessage[]
  total?: number
  page?: number
  pageSize?: number
}

export function normalizeMessage(raw: RawMessage): Message {
  const timestamp = normalizeMessageTime(raw.createdAt || raw.createTime || raw.timestamp)
  const content = raw.content || ''
  const parsedText = parseTextContent(raw.messageType || 'TEXT', content)
  const messageType = raw.messageType || 'TEXT'

  return {
    messageId: String(raw.messageId ?? raw.id ?? ''),
    conversationId: String(raw.conversationId ?? ''),
    senderId: String(raw.senderId ?? ''),
    senderName: raw.senderName || '',
    senderAvatar: raw.senderAvatar || '',
    messageType,
    content,
    displayContent: messageType === 'STICKER' ? parseStickerDisplayName(content) : parsedText.text,
    mentions: parsedText.mentions,
    clientMsgId: raw.clientMsgId || undefined,
    createdAt: timestamp,
    status: raw.status || undefined,
    replyTo: parsedText.replyTo,
    readCount: Number(raw.readCount || 0),
    recipientCount: Number(raw.recipientCount || 0),
    readStatus: raw.readStatus === true ? 1 : Number(raw.readStatus || 0),
    readTime: raw.readTime || undefined,
  }
}

function normalizeMessageTime(value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'number') return new Date(value).toISOString()

  const raw = String(value)
  if (/^\d+$/.test(raw)) return new Date(Number(raw)).toISOString()
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) return raw

  // Backend LocalDateTime values are emitted without a timezone; the server runs in UTC.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
    return `${raw}Z`
  }
  return raw
}

function parseStickerDisplayName(content: string): string {
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object' && typeof parsed.name === 'string') {
      return `[表情] ${parsed.name}`
    }
  } catch {
    return '表情加载失败'
  }
  return '表情加载失败'
}

export function buildTextMessageContent(
  text: string,
  mentions: MessageMention[] = [],
  replyTo?: MessageReply | null,
): string {
  return JSON.stringify({
    text,
    mentions: normalizeMentions(mentions),
    replyTo: replyTo || null,
  })
}

function parseTextContent(
  messageType: string,
  content: string,
): { text: string; mentions: MessageMention[]; replyTo: MessageReply | null } {
  if (messageType !== 'TEXT') {
    return { text: content, mentions: [], replyTo: null }
  }
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object' && typeof parsed.text === 'string') {
      return {
        text: parsed.text,
        mentions: normalizeMentions(parsed.mentions),
        replyTo: normalizeReply(parsed.replyTo),
      }
    }
  } catch {
    // Old text messages were stored as plain strings.
  }
  return { text: content, mentions: [], replyTo: null }
}

function normalizeReply(raw: unknown): MessageReply | null {
  if (!raw || typeof raw !== 'object') return null
  const reply = raw as { messageId?: string | number; senderName?: string; text?: string }
  const messageId = String(reply.messageId ?? '')
  if (!messageId) return null
  return {
    messageId,
    senderName: reply.senderName || '',
    text: reply.text || '',
  }
}

function normalizeMentions(raw: unknown): MessageMention[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const result: MessageMention[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const mention = item as { type?: string; userId?: string | number; nickname?: string }
    const type: MessageMentionType =
      mention.type === 'all' || String(mention.userId ?? '') === MESSAGE_MENTION_ALL_ID ? 'all' : 'user'
    const userId = type === 'all' ? MESSAGE_MENTION_ALL_ID : String(mention.userId ?? '')
    const nickname = mention.nickname || (type === 'all' ? '所有人' : '')
    if (!userId || !nickname || seen.has(userId)) continue
    seen.add(userId)
    result.push({ type, userId, nickname })
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

export function getPendingMessages(limit = 100) {
  return http.get<RawMessage[]>('/api/messages/pending', { params: { limit } }).then((res) => ({
    ...res,
    data: (res.data || []).map(normalizeMessage),
  }))
}

export function acknowledgeMessage(messageId: string) {
  return http.post(`/api/messages/ack/${messageId}`)
}

export function markRead(convId: string, lastReadMessageId?: string) {
  return http.post(`/api/messages/read/${convId}`, null, {
    params: { lastReadMessageId: lastReadMessageId || undefined },
  })
}

export function recallMessage(messageId: string) {
  return http.post<RawMessage>(`/api/messages/recall/${messageId}`).then((res) => ({
    ...res,
    data: normalizeMessage(res.data),
  }))
}

export function searchMessages(convId: string, keyword: string, pageSize = 20) {
  return http.get<RawMessagePage>(`/api/messages/${convId}/search`, {
    params: { keyword, pageSize },
  }).then((res) => {
    const page = res.data || {}
    const records = page.records || page.data || []
    return {
      ...res,
      data: {
        records: records.map(normalizeMessage),
        total: page.total || 0,
        page: page.page || 1,
        pageSize: page.pageSize || pageSize,
      } satisfies MessagePage,
    }
  })
}
