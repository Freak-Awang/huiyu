import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  listConversations,
  type Conversation,
} from '../api/conversation'
import { getMessages, markRead, type Message } from '../api/message'

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([])
  const currentConversation = ref<Conversation | null>(null)
  const messages = ref<Map<string, Message[]>>(new Map())
  const unreadCounts = ref<Map<string, number>>(new Map())

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
  }

  function selectConversation(convId: string) {
    const conv = conversations.value.find((c) => c.conversationId === convId)
    if (!conv) return
    currentConversation.value = conv
    fetchMessages(convId)
    markAsRead(convId)
  }

  async function fetchMessages(convId: string, beforeId?: string) {
    const res = await getMessages(convId, beforeId)
    const msgs = res.data
    const existing = messages.value.get(convId) || []
    if (beforeId) {
      messages.value.set(convId, [...msgs, ...existing])
    } else {
      messages.value.set(convId, msgs)
    }
  }

  function addMessage(msg: Message) {
    const convMessages = messages.value.get(msg.conversationId) || []
    messages.value.set(msg.conversationId, [...convMessages, msg])

    const conv = conversations.value.find((c) => c.conversationId === msg.conversationId)
    if (conv) {
      conv.lastMessage = {
        messageId: msg.messageId,
        senderId: msg.senderId,
        senderName: msg.senderName,
        content: msg.content,
        messageType: msg.messageType,
        createdAt: msg.createdAt,
      }
    }
  }

  function receiveMessage(msg: Message) {
    addMessage(msg)
    const isCurrentConv =
      currentConversation.value?.conversationId === msg.conversationId
    if (!isCurrentConv) {
      const count = unreadCounts.value.get(msg.conversationId) || 0
      unreadCounts.value.set(msg.conversationId, count + 1)
    }
  }

  async function markAsRead(convId: string) {
    unreadCounts.value.set(convId, 0)
    try {
      await markRead(convId)
    } catch {
      // ignore
    }
  }

  function getUnreadCount(convId: string): number {
    return unreadCounts.value.get(convId) || 0
  }

  function updateMessageStatus(clientMsgId: string, serverMsgId: string) {
    for (const [, convMessages] of messages.value) {
      const msg = convMessages.find((m) => m.clientMsgId === clientMsgId)
      if (msg) {
        msg.messageId = serverMsgId
        break
      }
    }
  }

  return {
    conversations,
    currentConversation,
    messages,
    unreadCounts,
    currentMessages,
    pinnedConversations,
    unpinnedConversations,
    fetchConversations,
    selectConversation,
    fetchMessages,
    addMessage,
    receiveMessage,
    markAsRead,
    getUnreadCount,
    updateMessageStatus,
  }
})
