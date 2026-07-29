/**
 * 消息管理 API：封装消息分页查询、待收消息拉取、已读回执、消息撤回与搜索等接口。
 * 同时提供后端原始消息到前端标准 Message 类型的规范化转换，以及文本消息内容的构建与解析。
 */
import http from './index'
import { toServerUrl } from '../config/runtime'

/**
 * 聊天消息实体。
 */
export interface Message {
  /** 消息唯一标识（服务端生成） */
  messageId: string
  /** 所属会话 ID */
  conversationId: string
  /** 发送者 ID */
  senderId: string
  /** 发送者昵称 */
  senderName: string
  /** 发送者头像 URL */
  senderAvatar: string
  /** 发送者个性签名 */
  senderSignature: string
  /** 消息类型：文本、图片、文件或表情 */
  messageType: 'TEXT' | 'IMAGE' | 'FILE' | 'STICKER'
  /** 原始消息内容（JSON 字符串或纯文本） */
  content: string
  /** 格式化后的展示内容 */
  displayContent: string
  /** 被 @ 的用户列表 */
  mentions: MessageMention[]
  /** 客户端消息 ID（用于乐观更新与去重） */
  clientMsgId?: string
  /** 消息发送时间 */
  createdAt: string
  /** 消息状态 */
  status?: MessageStatus
  /** 回复/引用的原消息 */
  replyTo?: MessageReply | null
  /** 已读人数 */
  readCount: number
  /** 接收总人数 */
  recipientCount: number
  /** 已读状态（0 未读 / 1 已读） */
  readStatus: number
  /** 已读时间 */
  readTime?: string
}

/** 消息状态：已发送 / 发送中 / 发送失败 / 已撤回 */
export type MessageStatus = 'SENT' | 'SENDING' | 'FAILED' | 'RECALLED' | string
/** @ 提及类型：指定用户或所有人 */
export type MessageMentionType = 'user' | 'all'

/** @ 所有人的特殊用户 ID */
export const MESSAGE_MENTION_ALL_ID = '__ALL__'

/**
 * 消息中的 @ 提及信息。
 */
export interface MessageMention {
  /** 提及类型：用户或所有人 */
  type?: MessageMentionType
  /** 被提及用户 ID（@所有人时为 __ALL__） */
  userId: string
  /** 被提及用户昵称 */
  nickname: string
}

/**
 * 判断该提及是否为 @所有人。
 * @param mention 提及对象
 * @returns 是 @所有人返回 true
 */
export function isAllMention(mention: MessageMention): boolean {
  return mention.type === 'all' || mention.userId === MESSAGE_MENTION_ALL_ID
}

/**
 * 消息回复/引用信息。
 */
export interface MessageReply {
  /** 原消息 ID */
  messageId: string
  /** 原消息发送者昵称 */
  senderName: string
  /** 原消息内容摘要 */
  text: string
}

/**
 * 消息已读回执。
 */
export interface MessageReadReceipt {
  /** 消息 ID */
  messageId: string
  /** 已读人数 */
  readCount: number
  /** 接收总人数 */
  recipientCount: number
  /** 已读状态 */
  readStatus: number
  /** 已读时间 */
  readTime?: string
}

/**
 * 消息分页查询结果。
 */
export interface MessagePage {
  /** 当前页消息列表 */
  records: Message[]
  /** 总消息数 */
  total: number
  /** 当前页码 */
  page: number
  /** 每页大小 */
  pageSize: number
}

/**
 * 后端返回的原始消息数据结构，字段命名与类型可能不统一，需经 normalizeMessage 转换。
 */
export interface RawMessage {
  id?: number | string
  messageId?: number | string
  conversationId?: number | string
  senderId?: number | string
  senderName?: string | null
  senderAvatar?: string | null
  senderSignature?: string | null
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

/**
 * 将后端原始消息数据规范化为前端统一的 Message 类型。
 * 处理时间格式转换、头像 URL 补全、消息内容解析（文本/表情/文件）及已读状态标准化。
 * @param raw 后端原始消息数据
 * @returns 规范化后的 Message 对象
 */
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
    senderAvatar: raw.senderAvatar ? toServerUrl(raw.senderAvatar) : '',
    senderSignature: raw.senderSignature || '',
    messageType,
    content,
    displayContent: messageType === 'STICKER'
      ? parseStickerDisplayName(content)
      : messageType === 'FILE'
        ? parseFileDisplayName(content)
        : parsedText.text,
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

function parseFileDisplayName(content: string): string {
  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object' && typeof parsed.fileName === 'string') {
      return `[文件] ${parsed.fileName}`
    }
  } catch {
    // Old or malformed file messages fall back to the raw payload.
  }
  return '[文件]'
}

/**
 * 构建文本消息的 JSON 内容字符串，包含 @ 提及与回复引用。
 * @param text 消息文本
 * @param mentions 被 @ 的用户列表
 * @param replyTo 回复/引用的原消息
 * @returns JSON 格式的消息内容字符串
 */
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

/**
 * 分页获取会话历史消息。
 * 调用 GET /api/messages/:convId
 * @param convId 会话 ID
 * @param beforeMessageId 分页锚点：获取该消息之前的历史消息
 * @param pageSize 每页数量，默认 50
 * @returns 规范化后的消息分页结果
 */
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

/**
 * 确认消息已接收（ACK）。
 * 调用 POST /api/messages/ack/:messageId
 * @param messageId 消息 ID
 * @returns 确认结果
 */
export function acknowledgeMessage(messageId: string) {
  return http.post(`/api/messages/ack/${messageId}`)
}

/**
 * 标记会话消息为已读。
 * 调用 POST /api/messages/read/:convId
 * @param convId 会话 ID
 * @param lastReadMessageId 已读到的最后一条消息 ID（可选，为空则标记全部已读）
 * @returns 标记结果
 */
export function markRead(convId: string, lastReadMessageId?: string) {
  return http.post(`/api/messages/read/${convId}`, null, {
    params: { lastReadMessageId: lastReadMessageId || undefined },
  })
}

/**
 * 撤回消息。
 * 调用 POST /api/messages/recall/:messageId
 * @param messageId 待撤回的消息 ID
 * @returns 撤回后的消息对象
 */
export function recallMessage(messageId: string) {
  return http.post<RawMessage>(`/api/messages/recall/${messageId}`).then((res) => ({
    ...res,
    data: normalizeMessage(res.data),
  }))
}

/**
 * 在会话中搜索消息。
 * 调用 GET /api/messages/:convId/search
 * @param convId 会话 ID
 * @param keyword 搜索关键词
 * @param pageSize 每页数量，默认 20
 * @returns 匹配的消息分页结果
 */
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
