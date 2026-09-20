import { computed, readonly, shallowRef } from 'vue'
import { RECENT_EMOJI_KEY, RECENT_EMOJI_LIMIT } from '../constants'
import { getEmojiById, hasEmoji, loadEmojiCatalog } from './useEmojiCatalog'
import type { BuiltinEmoji } from '../types'

const ids = shallowRef<string[]>([])
let initialized = false
export function normalizeRecentEmoji(value: unknown, exists: (id: string) => boolean): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && exists(id)))].slice(0, RECENT_EMOJI_LIMIT)
}
export function addRecentEmoji(previous: readonly string[], id: string, exists: (id: string) => boolean): string[] {
  return normalizeRecentEmoji([id, ...previous], exists)
}
function persist(): void {
  try { localStorage.setItem(RECENT_EMOJI_KEY, JSON.stringify(ids.value)) } catch { /* Private mode / full storage must not prevent composing. */ }
}
export async function loadRecentEmoji(): Promise<void> {
  await loadEmojiCatalog()
  if (initialized) return
  initialized = true
  try { ids.value = normalizeRecentEmoji(JSON.parse(localStorage.getItem(RECENT_EMOJI_KEY) || '[]'), hasEmoji) }
  catch { ids.value = [] }
  persist()
}
export function rememberEmoji(id: string): void {
  if (!hasEmoji(id)) return
  ids.value = addRecentEmoji(ids.value, id, hasEmoji)
  persist()
}
export function clearRecentEmoji(): void { ids.value = []; persist() }
export function useRecentEmoji() {
  return { ids: readonly(ids), emojis: computed(() => ids.value.map(getEmojiById).filter((emoji): emoji is BuiltinEmoji => !!emoji)), loadRecentEmoji, rememberEmoji }
}
