import { app, safeStorage } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

interface Draft {
  text: string
  mentions: Array<{ type?: 'user' | 'all'; userId: string; nickname: string }>
  replyTo: { messageId: string; senderName: string; text: string } | null
}

type DraftStore = Record<string, Record<string, Draft>>
const storePath = () => join(app.getPath('userData'), 'conversation-drafts-v1.enc')

function readDrafts(): DraftStore {
  try {
    return JSON.parse(safeStorage.decryptString(readFileSync(storePath()))) as DraftStore
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}

export function listLocalDrafts(userId: string): Record<string, Draft> {
  if (!userId) return {}
  const stored = readDrafts()[`user:${userId}`] || {}
  return Object.fromEntries(Object.entries(stored).map(([key, draft]) => [key.slice('conversation:'.length), draft]))
}

export function saveLocalDraft(userId: string, conversationId: string, value: Draft | null) {
  if (!userId || !conversationId) throw new Error('草稿账号或会话无效')
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用，草稿未保存')
  const draft = value === null ? null : normalizeDraft(value)
  const store = readDrafts()
  const account = store[`user:${userId}`] ||= {}
  const key = `conversation:${conversationId}`
  if (draft && (draft.text || draft.replyTo || draft.mentions.length)) account[key] = draft
  else delete account[key]
  const path = storePath()
  mkdirSync(dirname(path), { recursive: true })
  // Drafts are small. Complete the atomic write before replying, including during window shutdown.
  writeFileSync(`${path}.tmp`, safeStorage.encryptString(JSON.stringify(store)), { mode: 0o600 })
  renameSync(`${path}.tmp`, path)
  return true
}

function normalizeDraft(value: Draft): Draft {
  if (typeof value?.text !== 'string' || !Array.isArray(value.mentions)) throw new Error('草稿格式无效')
  if (value.text.length > 100000 || value.mentions.length > 1000) throw new Error('草稿内容过长')
  return {
    text: value.text,
    mentions: value.mentions.filter((item) => item && typeof item.userId === 'string' && typeof item.nickname === 'string')
      .map((item) => ({ type: item.type === 'all' ? 'all' : 'user', userId: item.userId, nickname: item.nickname })),
    replyTo: value.replyTo && typeof value.replyTo.messageId === 'string'
      ? { messageId: value.replyTo.messageId, senderName: String(value.replyTo.senderName || ''), text: String(value.replyTo.text || '') }
      : null,
  }
}
