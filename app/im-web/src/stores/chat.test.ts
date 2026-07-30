/**
 * 聊天 Store 单元测试：验证搜索命中的历史消息可安全合入当前缓存。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Conversation } from '../api/conversation'
import type { Message } from '../api/message'

vi.mock('../api/index', () => ({ default: {} }))
vi.mock('../utils/localMessageStore', () => ({
  canUseLocalMessageStore: () => false,
  listLocalMessages: vi.fn(async () => []),
  upsertLocalMessage: vi.fn(async () => undefined),
}))

import { useChatStore } from './chat'

function message(messageId: string, createdAt: string, content = messageId): Message {
  return {
    messageId,
    conversationId: 'conversation-1',
    senderId: 'user-1',
    senderName: '用户',
    senderAvatar: '',
    senderSignature: '',
    messageType: 'TEXT',
    content,
    displayContent: content,
    mentions: [],
    createdAt,
    readCount: 0,
    recipientCount: 1,
    readStatus: 0,
  }
}

function conversation(): Conversation {
  return {
    conversationId: 'conversation-1',
    type: 'SINGLE',
    name: '会话',
    avatar: '',
    avatarType: null,
    canEditAvatar: false,
    lastMessage: {
      messageId: 'latest',
      senderId: 'user-1',
      senderName: '用户',
      content: '最新消息',
      messageType: 'TEXT',
      createdAt: '2026-07-30T10:00:00Z',
    },
    memberCount: 2,
    pinned: false,
    createdAt: '2026-07-30T09:00:00Z',
    updatedAt: '2026-07-30T10:00:00Z',
    unreadCount: 0,
    mentionUnreadCount: 0,
    muted: false,
  }
}

describe('ChatStore historical message merge', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('inserts a search result in chronological order without changing the conversation preview', () => {
    const store = useChatStore()
    const conv = conversation()
    store.conversations.push(conv)
    store.messages.set('conversation-1', [
      message('older', '2026-07-30T09:00:00Z'),
      message('newer', '2026-07-30T09:20:00Z'),
    ])

    store.mergeHistoricalMessage(message('target', '2026-07-30T09:10:00Z'))

    expect(store.messages.get('conversation-1')?.map((item) => item.messageId)).toEqual([
      'older',
      'target',
      'newer',
    ])
    expect(conv.lastMessage?.messageId).toBe('latest')
  })

  it('updates an existing historical message without creating a duplicate', () => {
    const store = useChatStore()
    store.messages.set('conversation-1', [
      message('target', '2026-07-30T09:10:00Z', '旧内容'),
    ])

    store.mergeHistoricalMessage(message('target', '2026-07-30T09:10:00Z', '新内容'))

    expect(store.messages.get('conversation-1')).toHaveLength(1)
    expect(store.messages.get('conversation-1')?.[0].displayContent).toBe('新内容')
  })
})
