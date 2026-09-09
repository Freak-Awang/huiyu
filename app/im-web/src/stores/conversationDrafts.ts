import { computed, ref, watch, type Ref } from 'vue'
import type { MessageMention, MessageReply } from '../api/message'

export interface ConversationDraft {
  text: string
  mentions: MessageMention[]
  replyTo: MessageReply | null
}

const emptyDraft = (): ConversationDraft => ({ text: '', mentions: [], replyTo: null })

/** Computed fields follow the account/conversation synchronously, including programmatic navigation. */
export function useConversationDrafts(userId: Ref<string>, conversationId: Ref<string | undefined>) {
  const accounts = ref<Record<string, Record<string, ConversationDraft>>>({})
  const dirty = new Set<string>()
  const error = ref('')
  const pending = new Set<Promise<unknown>>()
  const accountKey = (id: string) => `user:${id}`
  const conversationKey = (id: string) => `conversation:${id}`
  const key = (user: string, conversation: string) => `${accountKey(user)}/${conversationKey(conversation)}`

  function getDraft(id = conversationId.value): ConversationDraft {
    if (!userId.value || !id) return emptyDraft()
    return accounts.value[accountKey(userId.value)]?.[conversationKey(id)] || emptyDraft()
  }

  function update(patch: Partial<ConversationDraft>, conversation = conversationId.value) {
    const user = userId.value
    if (!user || !conversation) return
    const next = { ...getDraft(conversation), ...patch }
    // Snapshot nested arrays/objects before IPC, never persist Vue proxies.
    const snapshot: ConversationDraft = JSON.parse(JSON.stringify(next))
    const account = accounts.value[accountKey(user)] ||= {}
    account[conversationKey(conversation)] = snapshot
    dirty.add(key(user, conversation))
    const save = window.imDesktop?.saveDraft
    if (!save) {
      error.value = '当前环境无法保存草稿，关闭后将丢失未发送内容'
      return
    }
    const operation = save(user, conversation, snapshot).then(() => {
      if (userId.value === user) error.value = ''
    }).catch(() => {
      if (userId.value === user) error.value = '草稿保存失败，请保留未发送内容后重试'
    }).finally(() => pending.delete(operation))
    pending.add(operation)
  }

  watch(userId, async (user) => {
    error.value = ''
    if (!user || !window.imDesktop?.listDrafts) return
    try {
      const saved = await window.imDesktop.listDrafts(user)
      const account = accounts.value[accountKey(user)] ||= {}
      for (const [conversation, draft] of Object.entries(saved)) {
        // Loading from disk must never replace text entered while the read was in flight.
        if (!dirty.has(key(user, conversation))) account[conversationKey(conversation)] = draft
      }
    } catch {
      if (userId.value === user) error.value = '本机草稿读取失败'
    }
  }, { immediate: true, flush: 'sync' })

  return {
    text: computed({ get: () => getDraft().text, set: (text: string) => update({ text }) }),
    mentions: computed({ get: () => getDraft().mentions, set: (mentions: MessageMention[]) => update({ mentions }) }),
    replyTo: computed({ get: () => getDraft().replyTo, set: (replyTo: MessageReply | null) => update({ replyTo }) }),
    clear: () => update(emptyDraft()),
    snapshot: (id: string): ConversationDraft => JSON.parse(JSON.stringify(getDraft(id))),
    clearIfUnchanged: (id: string, sent: ConversationDraft) => {
      if (JSON.stringify(getDraft(id)) === JSON.stringify(sent)) update(emptyDraft(), id)
    },
    preview: (id: string) => getDraft(id).text || (getDraft(id).replyTo ? '[引用]' : ''),
    flush: () => Promise.all([...pending]),
    error,
  }
}
