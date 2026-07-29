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
  }>
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
  } catch {
    // 缓存损坏或缺失不应阻塞桌面应用，服务端同步可重新填充
    return { users: {} }
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
    delete store.users[userId]
    return true
  })
}
