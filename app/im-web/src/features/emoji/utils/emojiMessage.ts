import { EMOJI_FALLBACK, EMOJI_ID_PATTERN } from '../constants'
import type { EmojiMessageSegment } from '../types'
import { parseEmojiMessage } from './emojiParser'

export function emojiToken(id: string): string {
  return EMOJI_ID_PATTERN.test(id) ? `[emoji:${id}]` : EMOJI_FALLBACK
}
export function serializeEmojiSegments(segments: readonly EmojiMessageSegment[]): string {
  return segments.map(segment => segment.type === 'text' ? segment.text : emojiToken(segment.id)).join('')
}
export function emojiToPlainText(text: string): string {
  return parseEmojiMessage(text).map(segment => segment.type === 'text' ? segment.text : EMOJI_FALLBACK).join('')
}
export function isEmojiOnlyMessage(message: string | readonly EmojiMessageSegment[]): boolean {
  const segments = typeof message === 'string' ? parseEmojiMessage(message) : message
  return segments.some(segment => segment.type === 'emoji')
    && segments.every(segment => segment.type === 'emoji' || !segment.text.trim())
}
export function emojiMessageSize(message: string | readonly EmojiMessageSegment[]): string {
  const segments = typeof message === 'string' ? parseEmojiMessage(message) : message
  if (!isEmojiOnlyMessage(segments)) return '1.35em'
  const count = segments.filter(segment => segment.type === 'emoji').length
  return count === 1 ? '48px' : count <= 3 ? '40px' : '32px'
}
