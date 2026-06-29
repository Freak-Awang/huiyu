// Intent: localMessageStore isolates reusable client-side behavior from Vue components.
import { normalizeMessage, type Message, type RawMessage } from '../api/message'

export function getLocalMessageUserId() {
  return localStorage.getItem('imCurrentUserId') || ''
}

export function canUseLocalMessageStore() {
  return typeof window !== 'undefined' && !!window.imDesktop
}

export interface LocalMessageStats {
  conversationCount: number
  messageCount: number
  cacheSize: number
}

export async function upsertLocalMessage(message: Message, userId = getLocalMessageUserId()) {
  if (!canUseLocalMessageStore() || !userId) return
  await window.imDesktop!.upsertMessage(userId, message)
}

export async function listLocalMessages(
  conversationId: string,
  beforeMessageId?: string,
  pageSize = 50,
  userId = getLocalMessageUserId(),
): Promise<Message[]> {
  if (!canUseLocalMessageStore() || !userId) return []
  const records = await window.imDesktop!.listMessages(userId, conversationId, beforeMessageId, pageSize)
  return records.map((item) => normalizeMessage(item as RawMessage))
}

export async function searchLocalMessages(
  conversationId: string,
  keyword: string,
  limit = 20,
  userId = getLocalMessageUserId(),
): Promise<Message[]> {
  if (!canUseLocalMessageStore() || !userId) return []
  const records = await window.imDesktop!.searchMessages(userId, conversationId, keyword, limit)
  return records.map((item) => normalizeMessage(item as RawMessage))
}

export async function getLocalMessageStats(userId = getLocalMessageUserId()): Promise<LocalMessageStats | null> {
  if (!canUseLocalMessageStore() || !userId || !window.imDesktop?.getMessageStats) return null
  return window.imDesktop.getMessageStats(userId)
}

export async function clearLocalMessages(userId = getLocalMessageUserId()): Promise<boolean> {
  if (!canUseLocalMessageStore() || !userId || !window.imDesktop?.clearMessages) return false
  return window.imDesktop.clearMessages(userId)
}
