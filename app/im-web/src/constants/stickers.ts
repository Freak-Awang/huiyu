/**
 * 贴纸分组常量
 *
 * 定义聊天交互中使用的内置贴纸数据，支持内置（builtin）和自定义（custom）两种来源。
 * 内置贴纸使用本地 SVG 资源，自定义贴纸通过 IndexedDB 存储。
 * 提供贴纸内容的序列化/反序列化工具函数。
 */
import smileUrl from '../assets/stickers/smile.svg'
import laughUrl from '../assets/stickers/laugh.svg'
import heartUrl from '../assets/stickers/heart.svg'
import okUrl from '../assets/stickers/ok.svg'
import cryUrl from '../assets/stickers/cry.svg'
import angryUrl from '../assets/stickers/angry.svg'

/** 贴纸数据模型 */
export interface Sticker {
  id: string
  name: string
  url: string
  source?: 'builtin' | 'custom'  // 来源：内置 或 用户自定义
  localOnly?: boolean             // 是否仅本地存储（自定义贴纸不上传服务端时）
  mimeType?: string
  size?: number
  createdAt?: string
  updatedAt?: string
}

/** 内置贴纸列表 */
export const STICKERS: Sticker[] = [
  { id: 'smile', name: '微笑', url: smileUrl },
  { id: 'laugh', name: '大笑', url: laughUrl },
  { id: 'heart', name: '爱心', url: heartUrl },
  { id: 'ok', name: '收到', url: okUrl },
  { id: 'cry', name: '哭哭', url: cryUrl },
  { id: 'angry', name: '生气', url: angryUrl },
]

/**
 * 从消息内容 JSON 中解析贴纸对象
 * 兼容自定义贴纸（source=custom, localOnly=true）和标准贴纸两种格式
 * @param content - 消息中的贴纸 JSON 字符串
 * @returns 解析后的 Sticker 对象，解析失败返回 null
 */
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

/**
 * 将贴纸对象序列化为消息内容 JSON
 * 自定义贴纸（localOnly）不包含 url 字段，避免向服务端暴露本地 blob URL
 * @param sticker - 贴纸对象
 * @returns JSON 字符串
 */
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
