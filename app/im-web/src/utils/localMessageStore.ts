/**
 * 本地消息存储桥接模块
 *
 * 渲染进程侧对 Electron 主进程本地消息存储的封装。
 * 通过 imDesktop preload API 调用主进程的加密消息缓存能力。
 * 所有函数均先检查桌面环境是否可用（canUseLocalMessageStore），浏览器环境静默降级返回空数据。
 */
import { normalizeMessage, type Message, type RawMessage } from '../api/message'

/** 获取当前登录用户ID */
export function getLocalMessageUserId() {
  return localStorage.getItem('imCurrentUserId') || ''
}

/** 判断是否可以使用本地消息存储（仅 Electron 桌面端） */
export function canUseLocalMessageStore() {
  return typeof window !== 'undefined' && !!window.imDesktop
}

/** 本地消息缓存统计 */
export interface LocalMessageStats {
  conversationCount: number
  messageCount: number
  cacheSize: number
}

/**
 * 保存消息到本地加密缓存
 * @param message - 消息对象
 * @param userId - 用户ID（默认从 localStorage 获取）
 */
export async function upsertLocalMessage(message: Message, userId = getLocalMessageUserId()) {
  if (!canUseLocalMessageStore() || !userId) return
  try {
    await window.imDesktop!.upsertMessage(userId, message)
  } catch (error) {
    console.warn('本地加密消息缓存不可用', error)
  }
}

/**
 * 分页查询本地消息历史
 * @param conversationId - 会话ID
 * @param beforeMessageId - 分页游标
 * @param pageSize - 每页条数
 * @param userId - 用户ID
 * @returns 规范化后的消息列表
 */
export async function listLocalMessages(
  conversationId: string,
  beforeMessageId?: string,
  pageSize = 50,
  userId = getLocalMessageUserId(),
): Promise<Message[]> {
  if (!canUseLocalMessageStore() || !userId) return []
  try {
    const records = await window.imDesktop!.listMessages(userId, conversationId, beforeMessageId, pageSize)
    return records.map((item) => normalizeMessage(item as RawMessage))
  } catch (error) {
    console.warn('本地加密消息缓存不可用', error)
    return []
  }
}

/**
 * 搜索本地消息
 * @param conversationId - 会话ID
 * @param keyword - 搜索关键词
 * @param limit - 返回条数上限
 * @param userId - 用户ID
 */
export async function searchLocalMessages(
  conversationId: string,
  keyword: string,
  limit = 20,
  userId = getLocalMessageUserId(),
): Promise<Message[]> {
  if (!canUseLocalMessageStore() || !userId) return []
  try {
    const records = await window.imDesktop!.searchMessages(userId, conversationId, keyword, limit)
    return records.map((item) => normalizeMessage(item as RawMessage))
  } catch (error) {
    console.warn('本地加密消息缓存不可用', error)
    return []
  }
}

/**
 * 获取本地消息缓存统计
 * @param userId - 用户ID
 * @returns 统计信息，不可用时返回 null
 */
export async function getLocalMessageStats(userId = getLocalMessageUserId()): Promise<LocalMessageStats | null> {
  if (!canUseLocalMessageStore() || !userId || !window.imDesktop?.getMessageStats) return null
  try {
    return await window.imDesktop.getMessageStats(userId)
  } catch (error) {
    console.warn('本地加密消息缓存不可用', error)
    return null
  }
}

/**
 * 清空本地消息缓存
 * @param userId - 用户ID
 * @returns 是否成功清空
 */
export async function clearLocalMessages(userId = getLocalMessageUserId()): Promise<boolean> {
  if (!canUseLocalMessageStore() || !userId || !window.imDesktop?.clearMessages) return false
  try {
    return await window.imDesktop.clearMessages(userId)
  } catch (error) {
    console.warn('本地加密消息缓存不可用', error)
    return false
  }
}
