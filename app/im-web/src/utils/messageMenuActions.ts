import { downloadFileBlob } from '../api/file'
import type { Message } from '../api/message'
import { extractFileDownloadId } from './fileUrl'
import { safeHttpUrl } from '../components/context-menu/builders'

export async function copyMessageText(text: string) {
  if (window.imDesktop?.copyText) {
    if (!await window.imDesktop.copyText(text)) throw new Error('复制失败')
  } else await navigator.clipboard.writeText(text)
}

export async function messageImageBlob(message: Message): Promise<Blob> {
  let url = message.content
  let fileId = ''
  try {
    const data: unknown = JSON.parse(message.content)
    if (data && typeof data === 'object') {
      const image = data as { fileId?: unknown; url?: unknown }
      fileId = typeof image.fileId === 'string' || typeof image.fileId === 'number' ? String(image.fileId) : ''
      url = typeof image.url === 'string' ? image.url : ''
    }
  } catch { /* Older messages contain a raw URL. */ }
  fileId ||= extractFileDownloadId(url)
  if (fileId) {
    if (!/^\d+$/.test(fileId)) throw new Error('图片标识无效')
    return (await downloadFileBlob(fileId)).data
  }
  const safe = safeHttpUrl(url)
  if (!safe) throw new Error('图片地址无效或图片已不可用')
  const result = await fetch(safe, { credentials: 'omit', referrerPolicy: 'no-referrer' })
  if (!result.ok) throw new Error('图片下载失败')
  const blob = await result.blob()
  if (!/^image\/(png|jpeg|gif|webp|bmp)$/.test(blob.type)) throw new Error('图片格式不支持')
  return blob
}

export async function copyMessageImage(message: Message) {
  const blob = await messageImageBlob(message)
  if (blob.size > 20 * 1024 * 1024) throw new Error('复制图片支持最大 20MB')
  if (window.imDesktop?.copyImage) {
    if (!await window.imDesktop.copyImage(await blob.arrayBuffer())) throw new Error('复制图片失败')
    return
  }
  // Clipboard image MIME support is browser-dependent; fail explicitly instead of copying a URL.
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
}

export async function saveMessageImage(message: Message) {
  if (!window.imDesktop?.saveImageAs) throw new Error('请使用桌面端另存为图片')
  const blob = await messageImageBlob(message)
  return window.imDesktop.saveImageAs(await blob.arrayBuffer(), `图片-${message.messageId}`)
}

export async function openMessageLink(value: string) {
  const url = safeHttpUrl(value)
  if (!url) throw new Error('仅支持有效的 http/https 链接')
  if (window.imDesktop) {
    if (!await window.imDesktop.openExternal(url)) throw new Error('无法打开链接')
  } else window.open(url, '_blank', 'noopener,noreferrer')
}
