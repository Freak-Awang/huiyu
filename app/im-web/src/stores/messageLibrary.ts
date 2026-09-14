import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { normalizeMessage, type Message } from '../api/message'

export function messageIdentity(message: Pick<Message, 'conversationId' | 'messageId' | 'clientMsgId'>) {
  return `${message.conversationId}:${message.messageId || message.clientMsgId}`
}
export const useMessageLibraryStore = defineStore('messageLibrary', () => {
  const deleted = ref<Record<string, string[]>>({})
  const favorites = ref<Message[]>([])
  const ready = ref(false)
  let account = ''
  let generation = 0
  const deletedSets = computed(() => new Map(Object.entries(deleted.value).map(([id, keys]) => [id, new Set(keys)])))
  const favoriteIds = computed(() => new Set(favorites.value.map(messageIdentity)))
  function isDeleted(message: Pick<Message, 'conversationId' | 'messageId' | 'clientMsgId'>) {
    const keys = deletedSets.value.get(message.conversationId)
    return !!keys && (keys.has(`id:${message.messageId}`) || !!message.clientMsgId && keys.has(`client:${message.clientMsgId}`))
  }
  function isFavorite(message: Message) { return favoriteIds.value.has(messageIdentity(message)) }
  async function init(userId: string) {
    reset()
    const epoch = generation
    account = userId
    if (!window.imDesktop?.messageLibrary || !userId) return
    const result = await window.imDesktop.messageLibrary(userId)
    if (epoch !== generation) return
    deleted.value = result.deleted
    favorites.value = result.favorites.map(normalizeMessage)
    ready.value = true
  }
  async function update(action: 'delete' | 'favorite' | 'unfavorite', messages: Message[]) {
    if (!ready.value || !window.imDesktop?.updateMessageLibrary) throw new Error('本机消息存储不可用，请重试')
    const epoch = generation
    const result = await window.imDesktop.updateMessageLibrary(account, action, messages.map(message => ({ ...message, mentions: message.mentions.map(mention => ({ ...mention })), replyTo: message.replyTo ? { ...message.replyTo } : null })))
    if (epoch !== generation) return
    deleted.value = result.deleted
    favorites.value = result.favorites.map(normalizeMessage)
  }
  function recalled(message: Message) {
    if (message.status === 'RECALLED') favorites.value = favorites.value.filter(item => messageIdentity(item) !== messageIdentity(message))
  }
  function reset() { generation++; account = ''; deleted.value = {}; favorites.value = []; ready.value = false }
  return { ready, favorites, init, update, isDeleted, isFavorite, recalled, reset }
})
