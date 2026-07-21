// Intent: userProfiles is the canonical renderer-side source for shared user identity and presence.
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { normalizeUserProfile, type UserProfile } from '../api/user'
import { normalizePresenceStatus, type PresenceStatus } from '../utils/presence'

export type UserProfileSnapshot = Omit<Partial<UserProfile>, 'userId'> & {
  userId?: string | number
  id?: string | number
  updateTime?: string
}

export const useUserProfileStore = defineStore('userProfiles', () => {
  const profiles = ref<Record<string, UserProfile>>({})
  const presence = ref<Record<string, PresenceStatus>>({})

  function getUserId(input?: UserProfileSnapshot | string | number | null): string {
    if (input == null) return ''
    if (typeof input === 'string' || typeof input === 'number') return String(input)
    return String(input.userId ?? input.id ?? '')
  }

  function upsertProfile(input: UserProfileSnapshot): UserProfile | null {
    const userId = getUserId(input)
    if (!userId) return null
    const incoming = normalizeUserProfile({ ...input, userId })
    const current = profiles.value[userId]
    if (current && isOlder(incoming.updatedAt, current.updatedAt)) return current
    profiles.value[userId] = incoming
    return incoming
  }

  function upsertProfiles(inputs: UserProfileSnapshot[]) {
    inputs.forEach(upsertProfile)
  }

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

  function seedSnapshots(inputs: UserProfileSnapshot[]) {
    inputs.forEach(seedSnapshot)
  }

  function getProfile(input?: UserProfileSnapshot | string | number | null): UserProfile | null {
    const userId = getUserId(input)
    return userId ? profiles.value[userId] || null : null
  }

  function resolveProfile(input?: UserProfileSnapshot | string | number | null): UserProfileSnapshot {
    if (input == null) return {}
    const fallback = typeof input === 'object' ? input : { userId: String(input) }
    return { ...fallback, ...(getProfile(input) || {}) }
  }

  function setPresence(userId: string | number, status: unknown) {
    const id = String(userId)
    if (!id) return
    presence.value[id] = normalizePresenceStatus(status)
  }

  function getPresence(userId: string | number | null | undefined): PresenceStatus {
    return userId == null ? 'offline' : presence.value[String(userId)] || 'offline'
  }

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
