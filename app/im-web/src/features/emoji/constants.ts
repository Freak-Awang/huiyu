import type { EmojiPickerCategory } from './types'

export const EMOJI_ID_PATTERN = /^builtin_emoji_\d{4}$/
export const EMOJI_FALLBACK = '[表情]'
export const RECENT_EMOJI_KEY = 'linghui.im.emoji.recent.v1'
export const RECENT_EMOJI_LIMIT = 40
export const EMOJI_CATEGORIES: readonly { id: EmojiPickerCategory; label: string; icon: string }[] = [
  { id: 'recent', label: '最近', icon: '◷' },
  { id: 'smile', label: '表情', icon: '☺' },
]
