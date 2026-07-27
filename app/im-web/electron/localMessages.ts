// Intent: Local message persistence keeps desktop chat history available when the network is unavailable.
import { app, safeStorage } from 'electron'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export interface LocalMessageRecord {
  messageId: string
  conversationId: string
  senderId: string
  senderName: string
  senderAvatar: string
  messageType: string
  content: string
  displayContent: string
  mentions: unknown[]
  clientMsgId?: string
  createdAt: string
  status?: string
  replyTo?: unknown
  readCount?: number
  recipientCount?: number
  readStatus?: number
  readTime?: string
}

interface LocalMessageStore {
  users: Record<string, {
    conversations: Record<string, LocalMessageRecord[]>
  }>
}

export interface LocalMessageStats {
  conversationCount: number
  messageCount: number
  cacheSize: number
}

const STORE_VERSION = 1
let mutationQueue: Promise<void> = Promise.resolve()

function getStorePath() {
  return join(app.getPath('userData'), `local-messages-v${STORE_VERSION}.json`)
}

async function readStoreUnlocked(): Promise<LocalMessageStore> {
  try {
    const raw = await readFile(getStorePath())
    const serialized = raw[0] === 0x7b
      ? raw.toString('utf8')
      : safeStorage.decryptString(raw)
    const parsed = JSON.parse(serialized) as LocalMessageStore
    return parsed && parsed.users ? parsed : { users: {} }
  } catch {
    // Corrupt or missing cache should never block the desktop app; server sync can repopulate it.
    return { users: {} }
  }
}

async function writeStoreUnlocked(store: LocalMessageStore) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS-protected storage is unavailable; refusing to persist plaintext messages')
  }
  const file = getStorePath()
  const temporary = `${file}.${process.pid}.tmp`
  await mkdir(dirname(file), { recursive: true })
  const encrypted = safeStorage.encryptString(JSON.stringify(store))
  await writeFile(temporary, encrypted, { mode: 0o600 })
  await rename(temporary, file)
}

async function readStore(): Promise<LocalMessageStore> {
  await mutationQueue
  return readStoreUnlocked()
}

function mutateStore<T>(mutator: (store: LocalMessageStore) => T | Promise<T>): Promise<T> {
  const operation = mutationQueue.then(async () => {
    const store = await readStoreUnlocked()
    const result = await mutator(store)
    await writeStoreUnlocked(store)
    return result
  })
  mutationQueue = operation.then(() => undefined, () => undefined)
  return operation
}

function getConversationBucket(store: LocalMessageStore, userId: string, conversationId: string) {
  store.users[userId] ||= { conversations: {} }
  store.users[userId].conversations[conversationId] ||= []
  return store.users[userId].conversations[conversationId]
}

function messageKey(message: LocalMessageRecord) {
  return message.messageId || message.clientMsgId || `${message.senderId}:${message.createdAt}:${message.content}`
}

function sortMessages(messages: LocalMessageRecord[]) {
  return messages.sort((a, b) => {
    const timeDiff = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
    if (timeDiff !== 0) return timeDiff
    return messageKey(a).localeCompare(messageKey(b))
  })
}

export async function upsertLocalMessage(userId: string, message: LocalMessageRecord) {
  if (!userId || !message?.conversationId) return
  await mutateStore((store) => {
    const bucket = getConversationBucket(store, userId, message.conversationId)
    const key = messageKey(message)
    const index = bucket.findIndex((item) => {
      if (message.messageId && item.messageId === message.messageId) return true
      if (message.clientMsgId && item.clientMsgId === message.clientMsgId) return true
      return messageKey(item) === key
    })
    if (index >= 0) {
      bucket[index] = { ...bucket[index], ...message }
    } else {
      bucket.push(message)
    }
    sortMessages(bucket)
  })
}

export async function listLocalMessages(
  userId: string,
  conversationId: string,
  beforeMessageId?: string,
  pageSize = 50,
) {
  // Pagination mirrors backend history loading: newest page by default, older page before a known message id.
  const store = await readStore()
  const bucket = sortMessages([...(store.users[userId]?.conversations[conversationId] || [])])
  const limit = Math.max(1, Math.min(pageSize, 200))
  if (!beforeMessageId) {
    return bucket.slice(Math.max(0, bucket.length - limit))
  }
  const index = bucket.findIndex(
    (item) => item.messageId === beforeMessageId || item.clientMsgId === beforeMessageId,
  )
  const end = index >= 0 ? index : bucket.length
  return bucket.slice(Math.max(0, end - limit), end)
}

export async function searchLocalMessages(userId: string, conversationId: string, keyword: string, limit = 20) {
  const store = await readStore()
  const normalizedKeyword = keyword.trim().toLowerCase()
  if (!normalizedKeyword) return []
  const bucket = sortMessages([...(store.users[userId]?.conversations[conversationId] || [])])
  return bucket
    .filter((message) => `${message.displayContent || ''}\n${message.content || ''}`.toLowerCase().includes(normalizedKeyword))
    .slice(-Math.max(1, Math.min(limit, 100)))
    .reverse()
}

export async function getLocalMessageStats(userId: string): Promise<LocalMessageStats> {
  const store = await readStore()
  const conversations = store.users[userId]?.conversations || {}
  const conversationBuckets = Object.values(conversations)
  let cacheSize = 0
  try {
    cacheSize = (await stat(getStorePath())).size
  } catch {
    cacheSize = Buffer.byteLength(JSON.stringify({ users: { [userId]: store.users[userId] || { conversations: {} } } }))
  }
  return {
    conversationCount: conversationBuckets.length,
    messageCount: conversationBuckets.reduce((sum, messages) => sum + messages.length, 0),
    cacheSize,
  }
}

export async function clearLocalMessages(userId: string) {
  if (!userId) return false
  return mutateStore((store) => {
    delete store.users[userId]
    return true
  })
}
