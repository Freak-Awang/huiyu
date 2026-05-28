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
  type Message,
} from '../api/message'
import {
  canUseLocalMessageStore,
  listLocalMessages,
  upsertLocalMessage,
} from '../utils/localMessageStore'

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([])
  const currentConversation = ref<Conversation | null>(null)
  const messages = ref<Map<string, Message[]>>(new Map())
  const unreadCounts = ref<Map<string, number>>(new Map())
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

  async function fetchConversations() {
    const res = await listConversations()
    conversations.value = res.data
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

  async function selectConversation(convId: string) {
    const conv = conversations.value.find((c) => c.conversationId === convId)
    if (!conv) return
    currentConversation.value = conv
    await fetchMessages(convId)
  }

  function upsertConversation(conv: Conversation) {
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

  async function refreshConversation(convId: string): Promise<Conversation | null> {
    try {
      const res = await getConversation(convId)
      upsertConversation(res.data)
      return res.data
    } catch {
      return null
    }
  }

  async function ensureConversation(convId: string): Promise<Conversation | null> {
    const existing = conversations.value.find((c) => c.conversationId === convId)
    if (existing) return existing

    try {
      return await refreshConversation(convId)
    } catch {
      return null
    }
  }

  async function fetchMessages(convId: string, beforeId?: string) {
    if (canUseLocalMessageStore()) {
      const localMessages = await listLocalMessages(convId, beforeId, 50)
      const existingRaw = messages.value.get(convId)
      const existing = Array.isArray(existingRaw) ? existingRaw : []
      if (beforeId) {
        messages.value.set(convId, [...localMessages, ...existing])
      } else {
        messages.value.set(convId, localMessages)
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

  function getMessagePreviewContent(msg: Message): string {
    if (msg.status === 'RECALLED') return '消息已撤回'
    return msg.displayContent || msg.content
  }

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

  function upsertMessage(msg: Message) {
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

  async function receiveMessage(
    msg: Message,
    currentUserId?: string,
    countAsUnread = true,
  ): Promise<Conversation | null> {
    const conv = await ensureConversation(msg.conversationId)
    addMessage(msg)
    const isOwnMessage = !!currentUserId && msg.senderId === currentUserId
    if (countAsUnread && !isOwnMessage) {
      const count = unreadCounts.value.get(msg.conversationId) || 0
      unreadCounts.value.set(msg.conversationId, count + 1)
      const mentioned = !!currentUserId && msg.mentions.some((m) => m.userId === currentUserId)
      if (conv?.type !== 'SINGLE' && mentioned) {
        const mentionCount = mentionUnreadCounts.value.get(msg.conversationId) || 0
        mentionUnreadCounts.value.set(msg.conversationId, mentionCount + 1)
      }
    }
    return conv
  }

  async function markAsRead(convId: string, lastReadMessageId?: string) {
    unreadCounts.value.set(convId, 0)
    mentionUnreadCounts.value.set(convId, 0)
    try {
      await markRead(convId, lastReadMessageId)
    } catch {
      // ignore
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

  function getUnreadCount(convId: string): number {
    return unreadCounts.value.get(convId) || 0
  }

  function getMentionUnreadCount(convId: string): number {
    return mentionUnreadCounts.value.get(convId) || 0
  }

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
    receiveMessage,
    markAsRead,
    applyReadReceipt,
    getUnreadCount,
    getMentionUnreadCount,
    updateMessageStatus,
    setMessageStatus,
  }
})
