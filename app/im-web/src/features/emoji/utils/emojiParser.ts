import type { EmojiMessageSegment } from '../types'

/** Unknown, well-formed IDs remain atomic and round-trip; only the catalog resolves resources. */
export function parseEmojiMessage(text: string): EmojiMessageSegment[] {
  const segments: EmojiMessageSegment[] = []
  const pattern = /\[emoji:(builtin_emoji_\d{4})\]/g
  let cursor = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index!
    if (start > cursor) segments.push({ type: 'text', text: text.slice(cursor, start) })
    segments.push({ type: 'emoji', id: match[1]! })
    cursor = start + match[0].length
  }
  if (cursor < text.length) segments.push({ type: 'text', text: text.slice(cursor) })
  return segments
}
