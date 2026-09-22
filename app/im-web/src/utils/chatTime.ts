/** Convert transport timestamps once; legacy values without an offset are local time. */
export function normalizeChatTime(value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return ''
  const raw = typeof value === 'string' ? value.trim() : value
  if (raw === '') return ''
  const date = new Date(typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw)
  return Number.isFinite(date.getTime()) ? date.toISOString() : ''
}

/** Conversation previews, message bubbles and search results share the device's local time. */
export function formatChatTime(value?: string, now = new Date()): string {
  const normalized = normalizeChatTime(value)
  if (!normalized) return ''
  const date = new Date(normalized)
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (date.toDateString() === now.toDateString()) return time
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${time}`
  return `${date.getMonth() + 1}/${date.getDate()} ${time}`
}
