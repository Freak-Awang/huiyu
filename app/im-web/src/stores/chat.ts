/**
 * 聊天核心 Store：管理会话列表、当前会话、消息缓存、未读数与 @ 未读数，
 * 处理消息收发、已读回执、历史消息合并及本地消息持久化等复杂状态逻辑。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getConversation,
  listConversations,
  type Conversation,
  type MessagePreview,
} from '../api/conversation'
import {
  acknowledgeMessage,
  getMessages,
  getPendingMessages,
  markRead,
  isAllMention,
  type Message,
  type MessageReadReceipt,
} from '../api/message'
import {
  canUseLocalMessageStore,
  listLocalMessages,
  upsertLocalMessage,
} from '../utils/localMessageStore'
import { useUserProfileStore } from './userProfiles'

/**
 * 聊天核心 Store：集中管理会话与消息状态。
 * state: conversations - 会话列表；currentConversation - 当前选中会话；
 *        messages - 按会话 ID 分组的消息缓存；unreadCounts - 未读消息数；
 *        mentionUnreadCounts - @ 我的未读消息数
 */
export const useChatStore = defineStore('chat', () => {
  const userProfiles = useUserProfileStore()
  /** 会话列表 */
  const conversations = ref<Conversation[]>([])
  /** 当前选中会话 */
  const currentConversation = ref<Conversation | null>(null)
  /** 按会话 ID 分组的消息缓存 */
  const messages = ref<Map<string, Message[]>>(new Map())
  /** 各会话未读消息数 */
  const unreadCounts = ref<Map<string, number>>(new Map())
  /** 各会话 @ 我的未读消息数 */
  const mentionUnreadCounts = ref<Map<string, number>>(new Map())

  const currentMessages = computed(() => {
    if (!currentConversation.value) return []
    return messages.value.get(currentConversation.value.conversationId) || []
  })

  const pinnedConversations = computed(() =>
    conversations.value.filter((c) => c.pinned)
  )

  const unpinnedConversations = computed(() =>
    conversations.value.filter((c) => !c.pinned)
  )

  /** 拉取会话列表并同步未读数、用户资料快照 */
  async function fetchConversations() {
    const res = await listConversations()
    conversations.value = res.data
    res.data.forEach(seedConversationProfiles)
    for (const conv of res.data) {
      unreadCounts.value.set(conv.conversationId, conv.unreadCount || 0)
      mentionUnreadCounts.value.set(conv.conversationId, conv.mentionUnreadCount || 0)
    }
    if (currentConversation.value) {
      const updated = conversations.value.find(
        (c) => c.conversationId === currentConversation.value?.conversationId
      )
      if (updated) {
        currentConversation.value = updated
      }
    }
  }

  /**
   * 选中并切换到指定会话，同时加载该会话消息。
   * @param convId 会话 ID
   */
  async function selectConversation(convId: string) {
    const conv = conversations.value.find((c) => c.conversationId === convId)
    if (!conv) return
    currentConversation.value = conv
    await fetchMessages(convId)
  }

  /**
   * 插入或更新会话信息，同步未读数与当前会话引用。
   * @param conv 会话对象
   */
  function upsertConversation(conv: Conversation) {
    seedConversationProfiles(conv)
    const index = conversations.value.findIndex(
      (item) => item.conversationId === conv.conversationId
    )
    if (index >= 0) {
      conversations.value[index] = conv
    } else {
      conversations.value.unshift(conv)
    }
    unreadCounts.value.set(conv.conversationId, conv.unreadCount || 0)
    mentionUnreadCounts.value.set(conv.conversationId, conv.mentionUnreadCount || 0)
    if (currentConversation.value?.conversationId === conv.conversationId) {
      currentConversation.value = conv
    }
  }

  /**
   * 从服务器刷新指定会话详情。
   * @param convId 会话 ID
   * @returns 刷新后的会话对象，失败返回 null
   */
  async function refreshConversation(convId: string): Promise<Conversation | null> {
    try {
      const res = await getConversation(convId)
      upsertConversation(res.data)
      return res.data
    } catch {
      return null
    }
  }

  /**
   * 确保指定会话存在于本地列表中，不存在则从服务器拉取。
   * @param convId 会话 ID
   * @returns 会话对象，获取失败返回 null
   */
  async function ensureConversation(convId: string): Promise<Conversation | null> {
    const existing = conversations.value.find((c) => c.conversationId === convId)
    if (existing) return existing

    try {
      return await refreshConversation(convId)
    } catch {
      return null
    }
  }

  /**
   * 加载会话历史消息。
   * 桌面端优先读取本地缓存实现秒开，再与服务器数据合并；
   * Web 端直接请求服务器分页数据。
   * @param convId 会话 ID
   * @param beforeId 分页锚点消息 ID（加载更早消息时传入）
   */
  async function fetchMessages(convId: string, beforeId?: string) {
    if (canUseLocalMessageStore()) {
      // Desktop mode reads local history first so the chat opens instantly and still works during transient server outages.
      const localMessages = await listLocalMessages(convId, beforeId, 50)
      const existingRaw = messages.value.get(convId)
      const existing = Array.isArray(existingRaw) ? existingRaw : []
      if (beforeId) {
        messages.value.set(convId, [...localMessages, ...existing])
      } else {
        messages.value.set(convId, localMessages)
      }
      try {
        const res = await getMessages(convId, beforeId)
        // Server data remains authoritative for delivery/read status and replaces optimistic local records by id/clientMsgId.
        mergeServerMessages(convId, [...res.data.records].reverse())
      } catch {
        // Local history remains usable if the server is unavailable.
      }
      return
    }
    const res = await getMessages(convId, beforeId)
    const msgs = [...res.data.records].reverse()
    const existingRaw = messages.value.get(convId)
    const existing = Array.isArray(existingRaw) ? existingRaw : []
    if (beforeId) {
      messages.value.set(convId, [...msgs, ...existing])
    } else {
      messages.value.set(convId, msgs)
    }
  }

  function messageSortValue(message: Message): number {
    const time = new Date(message.createdAt || 0).getTime()
    return Number.isFinite(time) ? time : 0
  }

  /**
   * 合并服务器消息到本地消息列表。
   * 按 messageId / clientMsgId 匹配去重，更新消息状态与已读信息，
   * 最后按时间排序并写回缓存。
   * @param convId 会话 ID
   * @param serverMessages 服务器返回的消息列表
   */
  function mergeServerMessages(convId: string, serverMessages: Message[]) {
    if (!serverMessages.length) return
    serverMessages.forEach(seedMessageProfile)
    const currentRaw = messages.value.get(convId)
    const current = Array.isArray(currentRaw) ? currentRaw : []
    const nextMessages = [...current]
    let changed = false

    for (const serverMessage of serverMessages) {
      // Match by server messageId first, then clientMsgId so optimistic sends collapse into the persisted message.
      const index = nextMessages.findIndex((msg) =>
        (serverMessage.messageId && msg.messageId === serverMessage.messageId) ||
        (serverMessage.clientMsgId && msg.clientMsgId === serverMessage.clientMsgId)
      )
      if (index >= 0) {
        const updated = {
          ...nextMessages[index],
          status: serverMessage.status,
          readCount: serverMessage.readCount,
          recipientCount: serverMessage.recipientCount,
          readStatus: serverMessage.readStatus,
          readTime: serverMessage.readTime,
        }
        nextMessages[index] = updated
        void upsertLocalMessage(updated)
      } else {
        nextMessages.push(serverMessage)
        void upsertLocalMessage(serverMessage)
      }
      changed = true
    }

    if (changed) {
      nextMessages.sort((a, b) => {
        const timeDiff = messageSortValue(a) - messageSortValue(b)
        if (timeDiff !== 0) return timeDiff
        return (a.messageId || a.clientMsgId || '').localeCompare(b.messageId || b.clientMsgId || '')
      })
      messages.value.set(convId, nextMessages)
    }
  }

  function getMessagePreviewContent(msg: Message): string {
    if (msg.status === 'RECALLED') return '消息已撤回'
    return msg.displayContent || msg.content
  }

  /** 拉取离线待收消息并逐条确认接收（ACK） */
  async function fetchPendingMessages() {
    const res = await getPendingMessages()
    for (const msg of res.data) {
      upsertMessage(msg)
      if (msg.messageId) {
        try {
          await acknowledgeMessage(msg.messageId)
        } catch {
          // The next pending sync will retry the delivery acknowledgement.
        }
      }
    }
  }

  /**
   * 更新会话的最后一条消息预览，可选将会话置顶到列表顶部。
   * @param msg 最新消息对象
   * @param moveToTop 是否将会话移动到列表顶部
   */
  function updateConversationLastMessage(msg: Message, moveToTop: boolean) {
    const conv = conversations.value.find((c) => c.conversationId === msg.conversationId)
    if (!conv) return

    const preview: MessagePreview = {
      messageId: msg.messageId,
      senderId: msg.senderId,
      senderName: msg.senderName,
      content: getMessagePreviewContent(msg),
      messageType: msg.messageType,
      createdAt: msg.createdAt,
    }
    conv.lastMessage = preview

    if (moveToTop) {
      conversations.value = [
        conv,
        ...conversations.value.filter((c) => c.conversationId !== msg.conversationId),
      ]
    }
  }

  /**
   * 插入或更新消息到本地缓存。
   * 实时消息、ACK 确认、重试与本地缓存回放统一走此路径，
   * 保证消息顺序稳定并同步更新会话预览。
   * @param msg 消息对象
   */
  function upsertMessage(msg: Message) {
    seedMessageProfile(msg)
    // Realtime messages, ACKs, retries, and local cache replay all converge through this path to keep ordering stable.
    const convMessagesRaw = messages.value.get(msg.conversationId)
    const convMessages = Array.isArray(convMessagesRaw) ? convMessagesRaw : []
    const existingIndex = convMessages.findIndex((m) =>
      (msg.messageId && m.messageId === msg.messageId) ||
      (msg.clientMsgId && m.clientMsgId === msg.clientMsgId)
    )
    if (existingIndex >= 0) {
      const updated = { ...convMessages[existingIndex], ...msg }
      const nextMessages = [...convMessages]
      nextMessages[existingIndex] = updated
      messages.value.set(msg.conversationId, nextMessages)

      const isLatestMessage = existingIndex === convMessages.length - 1
      if (isLatestMessage) {
        updateConversationLastMessage(updated, false)
      }
      void upsertLocalMessage(updated)
      return
    }

    messages.value.set(msg.conversationId, [...convMessages, msg])
    updateConversationLastMessage(msg, true)
    void upsertLocalMessage(msg)
  }

  function addMessage(msg: Message) {
    upsertMessage(msg)
  }

  /**
   * 将搜索命中的历史消息合入缓存，但不更新会话的最后消息预览。
   * 搜索结果可能不在当前分页中，因此需要按时间插入后才能在消息列表中定位。
   */
  function mergeHistoricalMessage(msg: Message) {
    seedMessageProfile(msg)
    const convMessagesRaw = messages.value.get(msg.conversationId)
    const convMessages = Array.isArray(convMessagesRaw) ? convMessagesRaw : []
    const existingIndex = convMessages.findIndex((item) =>
      (msg.messageId && item.messageId === msg.messageId) ||
      (msg.clientMsgId && item.clientMsgId === msg.clientMsgId)
    )
    const nextMessages = [...convMessages]
    if (existingIndex >= 0) {
      nextMessages[existingIndex] = { ...nextMessages[existingIndex], ...msg }
    } else {
      nextMessages.push(msg)
    }
    nextMessages.sort((left, right) => messageSortValue(left) - messageSortValue(right))
    messages.value.set(msg.conversationId, nextMessages)
    void upsertLocalMessage(msg)
  }

  /**
   * 处理接收到的实时消息。
   * 确保会话存在、插入消息、更新未读数与 @ 未读数。
   * @param msg 接收到的消息
   * @param currentUserId 当前用户 ID（用于判断是否自己发送）
   * @param countAsUnread 是否计入未读数
   * @returns 消息所属会话对象
   */
  async function receiveMessage(
    msg: Message,
    currentUserId?: string,
    countAsUnread = true,
  ): Promise<Conversation | null> {
    // Receiving a message may create/refresh the conversation first so sidebar badges and previews have a target.
    const conv = await ensureConversation(msg.conversationId)
    addMessage(msg)
    const isOwnMessage = !!currentUserId && msg.senderId === currentUserId
    if (countAsUnread && !isOwnMessage) {
      const count = unreadCounts.value.get(msg.conversationId) || 0
      unreadCounts.value.set(msg.conversationId, count + 1)
      const mentioned = !!currentUserId && msg.mentions.some((m) => m.userId === currentUserId || isAllMention(m))
      if (conv?.type !== 'SINGLE' && mentioned) {
        const mentionCount = mentionUnreadCounts.value.get(msg.conversationId) || 0
        mentionUnreadCounts.value.set(msg.conversationId, mentionCount + 1)
      }
    }
    return conv
  }

  /**
   * 标记会话为已读，失败时回滚未读数。
   * @param convId 会话 ID
   * @param lastReadMessageId 已读到的最后一条消息 ID
   */
  async function markAsRead(convId: string, lastReadMessageId?: string) {
    const previousUnread = unreadCounts.value.get(convId) || 0
    const previousMentions = mentionUnreadCounts.value.get(convId) || 0
    clearUnread(convId)
    try {
      await markRead(convId, lastReadMessageId)
    } catch {
      if ((unreadCounts.value.get(convId) || 0) === 0) {
        unreadCounts.value.set(convId, previousUnread)
      }
      if ((mentionUnreadCounts.value.get(convId) || 0) === 0) {
        mentionUnreadCounts.value.set(convId, previousMentions)
      }
    }
  }

  /**
   * 清空指定会话的未读数与 @ 未读数。
   * @param convId 会话 ID
   */
  function clearUnread(convId: string) {
    unreadCounts.value.set(convId, 0)
    mentionUnreadCounts.value.set(convId, 0)
  }

  /**
   * 批量应用消息已读回执，更新消息已读状态。
   * @param convId 会话 ID
   * @param receipts 已读回执列表
   */
  function applyReadReceipts(convId: string, receipts: MessageReadReceipt[]) {
    const convMessages = messages.value.get(convId)
    if (!Array.isArray(convMessages) || !receipts.length) return

    const receiptByMessageId = new Map(receipts.map((receipt) => [receipt.messageId, receipt]))
    let changed = false
    const nextMessages = convMessages.map((msg) => {
      const receipt = receiptByMessageId.get(msg.messageId)
      if (!receipt) return msg
      const updated = {
        ...msg,
        readCount: receipt.readCount,
        recipientCount: receipt.recipientCount,
        readStatus: receipt.readStatus,
        readTime: receipt.readTime || msg.readTime,
      }
      changed = true
      void upsertLocalMessage(updated)
      return updated
    })

    if (changed) {
      messages.value.set(convId, nextMessages)
    }
  }

  function applyReadReceipt(
    convId: string,
    readerId: string,
    lastReadMessageId?: string,
    readTime?: string,
    readMessageIds?: string[],
  ) {
    const convMessages = messages.value.get(convId)
    if (!Array.isArray(convMessages) || !readerId) return

    let changed = false
    const boundary = Number(lastReadMessageId || Number.MAX_SAFE_INTEGER)
    const readMessageIdSet = readMessageIds?.length ? new Set(readMessageIds) : null
    const nextMessages = convMessages.map((msg) => {
      if (!msg.messageId || msg.senderId === readerId) return msg
      if (readMessageIdSet && !readMessageIdSet.has(msg.messageId)) return msg
      const messageId = Number(msg.messageId)
      if (Number.isFinite(boundary) && Number.isFinite(messageId) && messageId > boundary) return msg

      const recipientCount = msg.recipientCount || 0
      const nextReadCount = recipientCount > 0
        ? Math.min(recipientCount, (msg.readCount || 0) + 1)
        : msg.readCount || 0
      const nextReadStatus = recipientCount > 0 && nextReadCount >= recipientCount ? 1 : msg.readStatus
      if (nextReadCount === msg.readCount && nextReadStatus === msg.readStatus && msg.readTime === readTime) {
        return msg
      }
      changed = true
      const updated = {
        ...msg,
        readCount: nextReadCount,
        readStatus: nextReadStatus,
        readTime: readTime || msg.readTime,
      }
      void upsertLocalMessage(updated)
      return updated
    })

    if (changed) {
      messages.value.set(convId, nextMessages)
    }
  }

  /**
   * 获取指定会话的未读消息数。
   * @param convId 会话 ID
   * @returns 未读消息数
   */
  function getUnreadCount(convId: string): number {
    return unreadCounts.value.get(convId) || 0
  }

  /**
   * 获取指定会话的 @ 我的未读消息数。
   * @param convId 会话 ID
   * @returns @ 未读消息数
   */
  function getMentionUnreadCount(convId: string): number {
    return mentionUnreadCounts.value.get(convId) || 0
  }

  /**
   * 根据客户端消息 ID 更新消息的服务端 ID 与状态（用于发送确认）。
   * @param clientMsgId 客户端消息 ID
   * @param serverMsgId 服务端消息 ID
   * @param status 新状态，默认 SENT
   */
  function updateMessageStatus(clientMsgId: string, serverMsgId: string, status = 'SENT') {
    for (const [, convMessages] of messages.value) {
      const msg = convMessages.find((m) => m.clientMsgId === clientMsgId)
      if (msg) {
        msg.messageId = String(serverMsgId || msg.messageId || '')
        msg.status = status
        void upsertLocalMessage(msg)
        break
      }
    }
  }

  /**
   * 根据客户端消息 ID 设置消息状态（如发送失败）。
   * @param clientMsgId 客户端消息 ID
   * @param status 新状态
   */
  function setMessageStatus(clientMsgId: string, status: string) {
    for (const [, convMessages] of messages.value) {
      const msg = convMessages.find((m) => m.clientMsgId === clientMsgId)
      if (msg) {
        msg.status = status
        void upsertLocalMessage(msg)
        break
      }
    }
  }

  function seedConversationProfiles(conv: Conversation) {
    userProfiles.seedSnapshots(conv.members || [])
  }

  function seedMessageProfile(message: Message) {
    userProfiles.seedSnapshot({
      userId: message.senderId,
      nickname: message.senderName,
      avatar: message.senderAvatar,
      signature: message.senderSignature,
    })
  }

  return {
    conversations,
    currentConversation,
    messages,
    unreadCounts,
    mentionUnreadCounts,
    currentMessages,
    pinnedConversations,
    unpinnedConversations,
    fetchConversations,
    selectConversation,
    upsertConversation,
    refreshConversation,
    ensureConversation,
    fetchMessages,
    fetchPendingMessages,
    addMessage,
    upsertMessage,
    mergeHistoricalMessage,
    receiveMessage,
    markAsRead,
    clearUnread,
    applyReadReceipts,
    applyReadReceipt,
    getUnreadCount,
    getMentionUnreadCount,
    updateMessageStatus,
    setMessageStatus,
  }
})
