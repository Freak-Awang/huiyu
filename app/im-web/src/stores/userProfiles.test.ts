import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../api/index', () => ({ default: {} }))

import { useUserProfileStore } from './userProfiles'

describe('UserProfileStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('allows authoritative updates to clear profile fields', () => {
    const store = useUserProfileStore()
    store.upsertProfile({
      userId: 7,
      nickname: '旧昵称',
      avatar: 'https://cdn.example.test/avatar.png',
      signature: '旧签名',
      updatedAt: '2026-07-21T10:00:00Z',
    })

    store.upsertProfile({
      userId: 7,
      nickname: '新昵称',
      avatar: '',
      signature: '',
      updatedAt: '2026-07-21T10:01:00Z',
    })

    expect(store.getProfile(7)).toMatchObject({ nickname: '新昵称', avatar: '', signature: '' })
  })

  it('ignores older authoritative responses and does not let snapshots overwrite cached data', () => {
    const store = useUserProfileStore()
    store.upsertProfile({ userId: 7, nickname: '最新昵称', updatedAt: '2026-07-21T10:02:00Z' })
    store.upsertProfile({ userId: 7, nickname: '旧响应', updatedAt: '2026-07-21T10:01:00Z' })
    store.seedSnapshot({ userId: 7, nickname: '消息快照', avatar: '/old.png' })

    expect(store.getProfile(7)?.nickname).toBe('最新昵称')
    expect(store.getProfile(7)?.avatar).toContain('/old.png')
  })

  it('stores presence separately and clears all state on logout', () => {
    const store = useUserProfileStore()
    store.upsertProfile({ userId: 7, nickname: '用户' })
    store.setPresence(7, 'away')

    expect(store.getPresence(7)).toBe('away')
    store.clear()
    expect(store.getProfile(7)).toBeNull()
    expect(store.getPresence(7)).toBe('offline')
  })
})
