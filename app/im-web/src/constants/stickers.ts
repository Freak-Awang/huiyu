// Intent: stickers groups static UI data that is reused across chat interactions.
import smileUrl from '../assets/stickers/smile.svg'
import laughUrl from '../assets/stickers/laugh.svg'
import heartUrl from '../assets/stickers/heart.svg'
import okUrl from '../assets/stickers/ok.svg'
import cryUrl from '../assets/stickers/cry.svg'
import angryUrl from '../assets/stickers/angry.svg'

export interface Sticker {
  id: string
  name: string
  url: string
  source?: 'builtin' | 'custom'
  localOnly?: boolean
  mimeType?: string
  size?: number
  createdAt?: string
  updatedAt?: string
}

export const STICKERS: Sticker[] = [
  { id: 'smile', name: '微笑', url: smileUrl },
  { id: 'laugh', name: '大笑', url: laughUrl },
  { id: 'heart', name: '爱心', url: heartUrl },
  { id: 'ok', name: '收到', url: okUrl },
  { id: 'cry', name: '哭哭', url: cryUrl },
  { id: 'angry', name: '生气', url: angryUrl },
]

export function parseStickerContent(content: string): Sticker | null {
  try {
    const parsed = JSON.parse(content)
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.source === 'custom' &&
      typeof parsed.id === 'string' &&
      typeof parsed.name === 'string'
    ) {
      return {
        id: parsed.id,
        name: parsed.name,
        url: typeof parsed.url === 'string' ? parsed.url : '',
        source: 'custom',
        localOnly: true,
      }
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.id === 'string' &&
      typeof parsed.name === 'string' &&
      typeof parsed.url === 'string'
    ) {
      return parsed
    }
  } catch {
    return null
  }
  return null
}

export function buildStickerContent(sticker: Sticker): string {
  const payload: Record<string, unknown> = {
    id: sticker.id,
    name: sticker.name,
    source: sticker.source || 'builtin',
  }
  if (!sticker.localOnly) {
    payload.url = sticker.url
  }
  return JSON.stringify(payload)
}
