import { readonly, shallowRef } from 'vue'
import { EMOJI_CATEGORIES, EMOJI_ID_PATTERN } from '../constants'
import type { BuiltinEmoji, EmojiCatalog, EmojiCategory, EmojiManifest } from '../types'
import { getBuiltinEmojiUrl } from '../utils/emojiUrl'

const catalog = shallowRef<EmojiCatalog | null>(null)
const error = shallowRef('')
let catalogPromise: Promise<EmojiCatalog> | null = null
const emptyCategory: readonly BuiltinEmoji[] = Object.freeze([])

export function createEmojiCatalog(input: unknown): EmojiCatalog {
  const manifest = input as Partial<EmojiManifest> | null
  if (manifest?.version !== 1 || manifest.packId !== 'builtin' || !Array.isArray(manifest.items)) throw new Error('Invalid emoji manifest')
  const byId = new Map<string, BuiltinEmoji>()
  const byCategory = new Map<EmojiCategory, BuiltinEmoji[]>()
  const files = new Set<string>()
  for (const category of EMOJI_CATEGORIES) if (category.id !== 'recent') byCategory.set(category.id, [])
  for (const item of manifest.items) {
    if (!item || typeof item.id !== 'string' || !EMOJI_ID_PATTERN.test(item.id) || byId.has(item.id)
      || !byCategory.has(item.category) || !Number.isSafeInteger(item.order) || item.order < 1
      || typeof item.file !== 'string' || files.has(item.file) || !item.file.startsWith(`images/${item.category}/`)
      || !(item.label === null || typeof item.label === 'string') || !(item.unicode === null || typeof item.unicode === 'string')
      || !Array.isArray(item.keywords) || !item.keywords.every(keyword => typeof keyword === 'string')) throw new Error('Invalid emoji item')
    getBuiltinEmojiUrl(item.file)
    const emoji = Object.freeze({ ...item, keywords: [...item.keywords] })
    byId.set(item.id, emoji)
    byCategory.get(item.category)!.push(emoji)
    files.add(item.file)
  }
  for (const items of byCategory.values()) Object.freeze(items.sort((a, b) => a.order - b.order))
  return { byId, byCategory }
}

/** Cache both success and failure: message instances never fan out requests or retry loops. */
export function loadEmojiCatalog(): Promise<EmojiCatalog> {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      let manifest: unknown
      if (window.location.protocol === 'file:' && window.imDesktop?.loadBuiltinEmojiManifest) {
        manifest = await window.imDesktop.loadBuiltinEmojiManifest()
      } else {
        const response = await fetch(getBuiltinEmojiUrl('manifest.v1.json'))
        if (!response.ok) throw new Error(`Emoji manifest: ${response.status}`)
        manifest = await response.json()
      }
      const result = createEmojiCatalog(manifest)
      catalog.value = result
      return result
    })().catch((cause: unknown) => {
      error.value = '表情资源加载失败'
      if (import.meta.env.DEV) console.warn('Emoji catalog unavailable', cause)
      throw cause
    })
  }
  return catalogPromise
}
export function getEmojiById(id: string): BuiltinEmoji | undefined { return catalog.value?.byId.get(id) }
export function getEmojisByCategory(category: EmojiCategory): readonly BuiltinEmoji[] { return catalog.value?.byCategory.get(category) || emptyCategory }
export function hasEmoji(id: string): boolean { return catalog.value?.byId.has(id) || false }
export function useEmojiCatalog() { return { catalog: readonly(catalog), error: readonly(error), loadEmojiCatalog, getEmojiById, getEmojisByCategory, hasEmoji } }
