/**
 * 本地消息持久化模块（Electron 主进程）
 *
 * 将聊天消息加密存储到本地文件系统，在网络不可用时提供离线历史记录访问。
 * 使用操作系统级安全存储（safeStorage）加密，原子写入防数据损坏，
 * 通过串行化变异队列（mutationQueue）保证并发安全。
 */
import { app, safeStorage } from 'electron'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** 单条本地消息记录，与后端消息结构对齐 */
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

/** 本地消息存储结构：按用户 -> 会话 两层组织 */
interface LocalMessageStore {
  users: Record<string, {
    conversations: Record<string, LocalMessageRecord[]>
    deleted?: Record<string, string[]>
    favorites?: LocalMessageRecord[]
  }>
}

export interface LocalMessageLibrary {
  deleted: Record<string, string[]>
  favorites: LocalMessageRecord[]
}

function assertLibraryId(value: string) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value) || ['__proto__', 'constructor', 'prototype'].includes(value)) {
    throw new Error('消息或账号标识无效')
  }
}
function messageKeys(message: LocalMessageRecord) {
  return [message.messageId && `id:${message.messageId}`, message.clientMsgId && `client:${message.clientMsgId}`].filter(Boolean) as string[]
}
function deletedInStore(store: LocalMessageStore, userId: string, message: LocalMessageRecord) {
  const keys = store.users[userId]?.deleted?.[message.conversationId] || []
  return messageKeys(message).some(key => keys.includes(key))
}
export async function getLocalMessageLibrary(userId: string): Promise<LocalMessageLibrary> {
  assertLibraryId(userId)
  const user = (await readStore()).users[userId]
  return { deleted: user?.deleted || {}, favorites: user?.favorites || [] }
}
export async function updateLocalMessageLibrary(userId: string, action: 'delete' | 'favorite' | 'unfavorite', messages: LocalMessageRecord[]) {
  assertLibraryId(userId)
  if (!['delete', 'favorite', 'unfavorite'].includes(action) || !Array.isArray(messages) || !messages.length || messages.length > 100) throw new Error('批量操作无效')
  for (const message of messages) {
    assertLibraryId(message?.conversationId)
    if (message.messageId) assertLibraryId(message.messageId)
    if (message.clientMsgId) assertLibraryId(message.clientMsgId)
    if (!messageKeys(message).length || typeof message.content !== 'string' || message.content.length > 2_000_000) throw new Error('消息数据无效')
  }
  return mutateStore(store => {
    store.users[userId] ||= { conversations: {} }
    const user = store.users[userId]
    user.deleted ||= {}
    user.favorites ||= []
    for (const message of messages) {
      const matches = (item: LocalMessageRecord) => item.conversationId === message.conversationId
        && messageKeys(item).some(key => messageKeys(message).includes(key))
      if (action === 'delete') {
        user.deleted[message.conversationId] = [...new Set([...(user.deleted[message.conversationId] || []), ...messageKeys(message)])]
        user.conversations[message.conversationId] = (user.conversations[message.conversationId] || []).filter(item => !matches(item))
      } else {
        if (action === 'favorite' && user.conversations[message.conversationId]?.some(item => matches(item) && item.status === 'RECALLED')) throw new Error('消息已撤回，无法收藏')
        user.favorites = user.favorites.filter(item => !matches(item))
        if (action === 'favorite' && message.status !== 'RECALLED') user.favorites.push(message)
      }
    }
    return { deleted: user.deleted, favorites: user.favorites }
  })
}

/** 本地缓存统计信息 */
export interface LocalMessageStats {
  conversationCount: number
  messageCount: number
  cacheSize: number
}

/** 存储格式版本号，升级时修改此值可实现数据迁移 */
const STORE_VERSION = 1

/** 串行化变异队列，确保读写操作原子有序，避免并发写覆盖 */
let mutationQueue: Promise<void> = Promise.resolve()

/** 获取存储文件路径，位于应用 userData 目录 */
function getStorePath() {
  return join(app.getPath('userData'), `local-messages-v${STORE_VERSION}.json`)
}

/**
 * 读取并解密本地存储（无锁版本，由调用方保证串行化）
 * 通过首字节判断明文/密文：0x7B 即 '{' 为明文 JSON，否则调用 safeStorage 解密
 */
async function readStoreUnlocked(): Promise<LocalMessageStore> {
  try {
    const raw = await readFile(getStorePath())
    const serialized = raw[0] === 0x7b
      ? raw.toString('utf8')
      : safeStorage.decryptString(raw)
    const parsed = JSON.parse(serialized) as LocalMessageStore
    return parsed && parsed.users ? parsed : { users: {} }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { users: {} }
    // Favorites and deletion markers are user data: never overwrite a damaged/encryption-locked store.
    throw new Error('本机消息存储无法读取，已保留原文件', { cause: error })
  }
}

/**
 * 加密并写入本地存储（无锁版本）
 * 采用"先写临时文件再原子重命名"策略，防止写入中断导致数据损坏
 */
async function writeStoreUnlocked(store: LocalMessageStore) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('操作系统安全存储不可用，拒绝明文持久化消息')
  }
  const file = getStorePath()
  const temporary = `${file}.${process.pid}.tmp`
  await mkdir(dirname(file), { recursive: true })
  const encrypted = safeStorage.encryptString(JSON.stringify(store))
  await writeFile(temporary, encrypted, { mode: 0o600 })
  // 原子重命名，避免写入一半时崩溃导致数据损坏
  await rename(temporary, file)
}

/** 读取存储（等待变异队列完成，保证读一致性） */
async function readStore(): Promise<LocalMessageStore> {
  await mutationQueue
  return readStoreUnlocked()
}

/**
 * 执行一次原子变异操作：读取 -> 修改 -> 写入
 * 通过 Promise 链将操作串行化，保证并发安全
 */
function mutateStore<T>(mutator: (store: LocalMessageStore) => T | Promise<T>): Promise<T> {
  const operation = mutationQueue.then(async () => {
    const store = await readStoreUnlocked()
    const result = await mutator(store)
    await writeStoreUnlocked(store)
    return result
  })
  // 重置链尾避免未捕获异常导致队列永久阻塞
  mutationQueue = operation.then(() => undefined, () => undefined)
  return operation
}

/** 获取或创建指定用户-会话的消息桶 */
function getConversationBucket(store: LocalMessageStore, userId: string, conversationId: string) {
  store.users[userId] ||= { conversations: {} }
  store.users[userId].conversations[conversationId] ||= []
  return store.users[userId].conversations[conversationId]
}

/** 生成消息唯一键：优先使用 messageId > clientMsgId > 组合键 */
function messageKey(message: LocalMessageRecord) {
  return message.messageId || message.clientMsgId || `${message.senderId}:${message.createdAt}:${message.content}`
}

/** 按时间排序，时间相同时按消息键字典序排序 */
function sortMessages(messages: LocalMessageRecord[]) {
  return messages.sort((a, b) => {
    const timeDiff = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
    if (timeDiff !== 0) return timeDiff
    return messageKey(a).localeCompare(messageKey(b))
  })
}

/**
 * 插入或更新单条本地消息
 * @param userId - 当前用户ID
 * @param message - 消息记录，存在则合并更新，不存在则追加
 */
export async function upsertLocalMessage(userId: string, message: LocalMessageRecord) {
  if (!userId || !message?.conversationId) return
  await mutateStore((store) => {
    // A recall must also erase the saved snapshot. A late ACK/history sync cannot resurrect a local deletion.
    if (message.status === 'RECALLED' && store.users[userId]?.favorites) {
      store.users[userId].favorites = store.users[userId].favorites!.filter(item => !messageKeys(item).some(key => messageKeys(message).includes(key)))
    }
    if (deletedInStore(store, userId, message)) return
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

/**
 * 分页查询本地消息
 * @param userId - 当前用户ID
 * @param conversationId - 会话ID
 * @param beforeMessageId - 分页游标，传此值则返回该消息之前的更早消息
 * @param pageSize - 每页条数，默认50，最大200
 * @returns 按时间升序排列的消息列表
 */
export async function listLocalMessages(
  userId: string,
  conversationId: string,
  beforeMessageId?: string,
  pageSize = 50,
) {
  const store = await readStore()
  const bucket = sortMessages([...(store.users[userId]?.conversations[conversationId] || [])])
  const limit = Math.max(1, Math.min(pageSize, 200))
  if (!beforeMessageId) {
    // 无游标时返回最新的一页
    return bucket.slice(Math.max(0, bucket.length - limit))
  }
  const index = bucket.findIndex(
    (item) => item.messageId === beforeMessageId || item.clientMsgId === beforeMessageId,
  )
  const end = index >= 0 ? index : bucket.length
  return bucket.slice(Math.max(0, end - limit), end)
}

/** Read-only, account-scoped attachment history for ownership-checked legacy migration. */
export async function listLocalP2pMessages(userId: string): Promise<LocalMessageRecord[]> {
  if (!userId) return []
  const store = await readStore()
  return Object.values(store.users[userId]?.conversations || {}).flat()
    .filter((message) => message && (message.messageType === 'FILE' || message.messageType === 'FOLDER'))
    .map((message) => ({ ...message }))
}

/**
 * 在本地消息中搜索关键词
 * @param userId - 当前用户ID
 * @param conversationId - 会话ID
 * @param keyword - 搜索关键词（大小写不敏感）
 * @param limit - 返回条数上限，默认20
 */
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

/**
 * 获取本地消息缓存统计
 * @param userId - 当前用户ID
 * @returns 会话数、消息总数、缓存文件大小
 */
export async function getLocalMessageStats(userId: string): Promise<LocalMessageStats> {
  const store = await readStore()
  const conversations = store.users[userId]?.conversations || {}
  const conversationBuckets = Object.values(conversations)
  let cacheSize = 0
  try {
    cacheSize = (await stat(getStorePath())).size
  } catch {
    // 文件不存在时估算内存中数据大小
    cacheSize = Buffer.byteLength(JSON.stringify({ users: { [userId]: store.users[userId] || { conversations: {} } } }))
  }
  return {
    conversationCount: conversationBuckets.length,
    messageCount: conversationBuckets.reduce((sum, messages) => sum + messages.length, 0),
    cacheSize,
  }
}

/**
 * 清空指定用户的所有本地消息缓存
 * @param userId - 当前用户ID
 * @returns 是否成功清空
 */
export async function clearLocalMessages(userId: string) {
  if (!userId) return false
  return mutateStore((store) => {
    // Cache cleanup must not erase deliberate deletions or a user's saved collection.
    if (store.users[userId]) store.users[userId].conversations = {}
    return true
  })
}

/**
 * 清空指定用户某个会话的本地消息缓存。
 */
export async function clearLocalConversationMessages(userId: string, conversationId: string) {
  if (!userId || !conversationId) return false
  return mutateStore((store) => {
    const conversations = store.users[userId]?.conversations
    if (conversations) delete conversations[conversationId]
    return true
  })
}
