/**
 * 用户资料 Store：作为渲染进程侧用户身份与在线状态的权威数据源，
 * 管理用户资料缓存、在线状态，支持权威更新与快照合并两种写入策略。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { normalizeUserProfile, type UserProfile } from '../api/user'
import { normalizePresenceStatus, type PresenceStatus } from '../utils/presence'

/**
 * 用户资料快照：用于部分更新或合并用户信息的输入类型。
 */
export type UserProfileSnapshot = Omit<Partial<UserProfile>, 'userId'> & {
  /** 用户 ID（与 id 二选一） */
  userId?: string | number
  /** 用户 ID（与 userId 二选一） */
  id?: string | number
  /** 资料更新时间（兼容后端 updateTime 命名） */
  updateTime?: string
}

/**
 * 用户资料 Store：集中管理用户资料缓存与在线状态。
 * state: profiles - 用户 ID 到 UserProfile 的映射；presence - 用户 ID 到在线状态的映射
 */
export const useUserProfileStore = defineStore('userProfiles', () => {
  /** 用户资料缓存 */
  const profiles = ref<Record<string, UserProfile>>({})
  /** 用户在线状态缓存 */
  const presence = ref<Record<string, PresenceStatus>>({})

  function getUserId(input?: UserProfileSnapshot | string | number | null): string {
    if (input == null) return ''
    if (typeof input === 'string' || typeof input === 'number') return String(input)
    return String(input.userId ?? input.id ?? '')
  }

  /**
   * 插入或更新用户资料（权威更新）。
   * 若 incoming 的 updatedAt 早于当前缓存，则忽略本次更新。
   * @param input 用户资料快照
   * @returns 更新后的用户资料，无效输入返回 null
   */
  function upsertProfile(input: UserProfileSnapshot): UserProfile | null {
    const userId = getUserId(input)
    if (!userId) return null
    const incoming = normalizeUserProfile({ ...input, userId })
    const current = profiles.value[userId]
    if (current && isOlder(incoming.updatedAt, current.updatedAt)) return current
    profiles.value[userId] = incoming
    return incoming
  }

  /**
   * 批量插入或更新用户资料。
   * @param inputs 用户资料快照数组
   */
  function upsertProfiles(inputs: UserProfileSnapshot[]) {
    inputs.forEach(upsertProfile)
  }

  /**
   * 合并用户资料快照（非权威更新）。
   * 仅填充当前缓存中缺失的字段，不覆盖已有有效值。
   * @param input 用户资料快照
   * @returns 合并后的用户资料，无效输入返回 null
   */
  function seedSnapshot(input: UserProfileSnapshot): UserProfile | null {
    const userId = getUserId(input)
    if (!userId) return null
    const incoming = normalizeUserProfile({ ...input, userId })
    const current = profiles.value[userId]
    if (!current) {
      profiles.value[userId] = incoming
      return incoming
    }

    const next = { ...current }
    for (const key of ['username', 'nickname', 'avatar', 'signature', 'email', 'phone', 'deptId', 'deptName', 'role'] as const) {
      if (!next[key] && incoming[key]) next[key] = incoming[key]
    }
    if ((next.status === '' || next.status == null) && incoming.status !== '') next.status = incoming.status
    if (!next.updatedAt && incoming.updatedAt) next.updatedAt = incoming.updatedAt
    profiles.value[userId] = next
    return next
  }

  /**
   * 批量合并用户资料快照。
   * @param inputs 用户资料快照数组
   */
  function seedSnapshots(inputs: UserProfileSnapshot[]) {
    inputs.forEach(seedSnapshot)
  }

  /**
   * 获取指定用户的资料。
   * @param input 用户 ID 或资料快照
   * @returns 用户资料，不存在返回 null
   */
  function getProfile(input?: UserProfileSnapshot | string | number | null): UserProfile | null {
    const userId = getUserId(input)
    return userId ? profiles.value[userId] || null : null
  }

  /**
   * 解析用户资料：优先返回缓存中的完整资料，无缓存时返回输入快照。
   * @param input 用户 ID 或资料快照
   * @returns 合并后的用户资料快照
   */
  function resolveProfile(input?: UserProfileSnapshot | string | number | null): UserProfileSnapshot {
    if (input == null) return {}
    const fallback = typeof input === 'object' ? input : { userId: String(input) }
    return { ...fallback, ...(getProfile(input) || {}) }
  }

  /**
   * 设置用户在线状态。
   * @param userId 用户 ID
   * @param status 原始状态值（自动规范化）
   */
  function setPresence(userId: string | number, status: unknown) {
    const id = String(userId)
    if (!id) return
    presence.value[id] = normalizePresenceStatus(status)
  }

  /**
   * 获取用户在线状态。
   * @param userId 用户 ID
   * @returns 在线状态，未知返回 offline
   */
  function getPresence(userId: string | number | null | undefined): PresenceStatus {
    return userId == null ? 'offline' : presence.value[String(userId)] || 'offline'
  }

  /** 清空所有用户资料与在线状态缓存（登出时调用） */
  function clear() {
    profiles.value = {}
    presence.value = {}
  }

  function isOlder(incoming: string, current: string): boolean {
    if (!incoming || !current) return false
    const incomingTime = Date.parse(incoming)
    const currentTime = Date.parse(current)
    return Number.isFinite(incomingTime) && Number.isFinite(currentTime) && incomingTime < currentTime
  }

  return {
    profiles,
    presence,
    upsertProfile,
    upsertProfiles,
    seedSnapshot,
    seedSnapshots,
    getProfile,
    resolveProfile,
    setPresence,
    getPresence,
    clear,
  }
})
