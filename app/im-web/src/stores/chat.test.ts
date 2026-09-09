/**
 * 聊天 Store 单元测试：验证搜索命中的历史消息可安全合入当前缓存。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { Conversation } from '../api/conversation'
import type { Message } from '../api/message'

vi.mock('../api/index', () => ({ default: {} }))
vi.mock('../api/conversation', async (original) => ({
  ...await original<typeof import('../api/conversation')>(),
  listConversations: vi.fn(),
}))
vi.mock('../api/message', async (original) => ({
  ...await original<typeof import('../api/message')>(),
  getPendingMessages: vi.fn(),
  acknowledgeMessage: vi.fn(),
  markRead: vi.fn(),
  getMessages: vi.fn(),
}))
vi.mock('../utils/localMessageStore', () => ({
  canUseLocalMessageStore: vi.fn(() => false),
  listLocalMessages: vi.fn(async () => []),
  upsertLocalMessage: vi.fn(async () => undefined),
}))

import { useChatStore } from './chat'
import { listConversations } from '../api/conversation'
import { getPendingMessages, acknowledgeMessage, markRead, getMessages } from '../api/message'
import { upsertLocalMessage, canUseLocalMessageStore, listLocalMessages } from '../utils/localMessageStore'

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

  it('clears only the selected conversation message cache', () => {
    const store = useChatStore()
    store.messages.set('conversation-1', [message('target', '2026-07-30T09:10:00Z')])
    store.messages.set('conversation-2', [
      { ...message('other', '2026-07-30T09:20:00Z'), conversationId: 'conversation-2' },
    ])

    store.clearConversationMessages('conversation-1')

    expect(store.messages.get('conversation-1')).toEqual([])
    expect(store.messages.get('conversation-2')).toHaveLength(1)
  })
})

describe('ChatStore delivery and read recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    vi.mocked(acknowledgeMessage).mockResolvedValue({} as never)
    vi.mocked(upsertLocalMessage).mockResolvedValue(undefined)
    vi.mocked(canUseLocalMessageStore).mockReturnValue(false)
  })
  afterEach(() => vi.restoreAllMocks())
  const page = (messages: Message[]) => ({ data: messages }) as Awaited<ReturnType<typeof getPendingMessages>>

  it('drains more than one page across conversations, persists before ACK, and keeps the newest preview', async () => {
    const store = useChatStore()
    const conv = conversation()
    store.conversations.push(conv)
    const records = Array.from({ length: 205 }, (_, i) => ({
      ...message(String(i + 1), '2026-07-30T09:10:00Z'),
      conversationId: i % 2 ? 'conversation-1' : 'conversation-2',
    }))
    const queue = [...records]
    vi.mocked(getPendingMessages).mockImplementation(async () => page(queue.slice(0, 100)))
    vi.mocked(acknowledgeMessage).mockImplementation(async (id) => {
      expect(upsertLocalMessage).toHaveBeenCalledWith(expect.objectContaining({ messageId: id }), undefined, true)
      queue.splice(queue.findIndex((item) => item.messageId === id), 1)
      return {} as never
    })
    const first = store.fetchPendingMessages()
    const concurrent = store.fetchPendingMessages()
    await Promise.all([first, concurrent])
    expect(getPendingMessages).toHaveBeenCalledTimes(4)
    expect(acknowledgeMessage).toHaveBeenCalledTimes(205)
    expect(store.messages.get('conversation-1')).toHaveLength(102)
    expect(store.messages.get('conversation-2')).toHaveLength(103)
    expect(conv.lastMessage?.messageId).toBe('latest')
    expect(store.getUnreadCount('conversation-1')).toBe(0)
  })

  it('retries a failed ACK without skipping the message or duplicating local history', async () => {
    const store = useChatStore()
    const msg = message('1', '2026-07-30T09:10:00Z')
    vi.mocked(getPendingMessages).mockResolvedValueOnce(page([msg])).mockResolvedValueOnce(page([msg])).mockResolvedValueOnce(page([]))
    vi.mocked(acknowledgeMessage).mockRejectedValueOnce(new Error('offline'))
    await expect(store.fetchPendingMessages()).rejects.toThrow('offline')
    await store.fetchPendingMessages()
    expect(store.messages.get('conversation-1')).toHaveLength(1)
    expect(acknowledgeMessage).toHaveBeenCalledTimes(2)
  })

  it('does not ACK when durable storage fails', async () => {
    vi.mocked(getPendingMessages).mockResolvedValue(page([message('1', '2026-07-30T09:10:00Z')]))
    vi.mocked(upsertLocalMessage).mockImplementation(async (_msg, _user, required) => {
      if (required) throw new Error('disk full')
    })
    await expect(useChatStore().fetchPendingMessages()).rejects.toThrow('disk full')
    expect(acknowledgeMessage).not.toHaveBeenCalled()
  })

  it('stops without an infinite loop if the server repeats an acknowledged page', async () => {
    vi.mocked(getPendingMessages).mockResolvedValue(page([message('1', '2026-07-30T09:10:00Z')]))
    await expect(useChatStore().fetchPendingMessages()).rejects.toThrow('确认未生效')
    expect(getPendingMessages).toHaveBeenCalledTimes(2)
  })

  it('discards an in-flight page after logout', async () => {
    let resolve!: (value: ReturnType<typeof page>) => void
    vi.mocked(getPendingMessages).mockImplementation(() => new Promise((done) => { resolve = done }))
    const store = useChatStore()
    const sync = store.fetchPendingMessages()
    store.reset()
    resolve(page([message('1', '2026-07-30T09:10:00Z')]))
    await sync
    expect(store.messages.size).toBe(0)
    expect(acknowledgeMessage).not.toHaveBeenCalled()
  })

  it('counts duplicate realtime deliveries only once while the chat is in the background', async () => {
    const store = useChatStore()
    store.conversations.push(conversation())
    const msg = message('1', '2026-07-30T09:10:00Z')
    await store.receiveMessage(msg, 'me', true)
    await store.receiveMessage(msg, 'me', true)
    expect(store.getUnreadCount('conversation-1')).toBe(1)
    expect(store.messages.get('conversation-1')).toHaveLength(1)
  })

  it('keeps unread counts on failure and preserves new messages received during read confirmation', async () => {
    const store = useChatStore()
    store.unreadCounts.set('conversation-1', 2)
    vi.mocked(markRead).mockRejectedValueOnce(new Error('offline'))
    expect(await store.markAsRead('conversation-1', '2')).toBe(false)
    expect(store.getUnreadCount('conversation-1')).toBe(2)
    let resolve!: (value: never) => void
    vi.mocked(markRead).mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    const read = store.markAsRead('conversation-1', '2')
    store.unreadCounts.set('conversation-1', 3)
    resolve({} as never)
    expect(await read).toBe(true)
    expect(store.getUnreadCount('conversation-1')).toBe(1)
  })

  it('never downgrades a late successful send or recall to failed', () => {
    const store = useChatStore()
    store.addMessage({ ...message('', '2026-07-30T09:10:00Z'), clientMsgId: 'c1', status: 'SENDING' })
    store.setMessageStatus('c1', 'FAILED')
    store.updateMessageStatus('c1', '501')
    store.setMessageStatus('c1', 'FAILED')
    expect(store.messages.get('conversation-1')?.[0]).toMatchObject({ messageId: '501', status: 'SENT' })
    store.updateMessageStatus('c1', '501', 'RECALLED')
    store.updateMessageStatus('c1', '501', 'SENT')
    expect(store.messages.get('conversation-1')?.[0]?.status).toBe('RECALLED')
  })

  it('does not overwrite a new background unread count with an older conversation snapshot', async () => {
    const store = useChatStore()
    store.conversations.push(conversation())
    let resolve!: (value: never) => void
    vi.mocked(listConversations).mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    const refresh = store.fetchConversations()
    await store.receiveMessage(message('100', '2026-07-30T10:10:00Z'), 'me', true)
    resolve({ data: [conversation()] } as never)
    await refresh
    expect(store.getUnreadCount('conversation-1')).toBe(1)
  })

  it('recovers an interrupted send after restart and reconciles a lost ACK with server history', async () => {
    const store = useChatStore()
    vi.mocked(canUseLocalMessageStore).mockReturnValue(true)
    vi.mocked(listLocalMessages).mockResolvedValue([
      { ...message('', '2026-07-30T09:10:00Z'), clientMsgId: 'c1', status: 'SENDING' },
    ])
    vi.mocked(getMessages).mockRejectedValueOnce(new Error('offline'))
    await store.fetchMessages('conversation-1')
    expect(store.messages.get('conversation-1')?.[0]?.status).toBe('FAILED')
    vi.mocked(getMessages).mockResolvedValueOnce({ data: { records: [
      { ...message('501', '2026-07-30T09:10:00Z'), clientMsgId: 'c1', status: 'SENT' },
    ] } } as never)
    await store.fetchMessages('conversation-1')
    expect(store.messages.get('conversation-1')).toHaveLength(1)
    expect(store.messages.get('conversation-1')?.[0]).toMatchObject({ messageId: '501', status: 'SENT' })
  })
})
