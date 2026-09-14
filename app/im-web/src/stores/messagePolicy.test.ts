import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
vi.mock('../api/index', () => ({ default: { get: vi.fn() } }))
import http from '../api/index'
import { normalizeMessage } from '../api/message'
import { useMessagePolicyStore } from './messagePolicy'
const now = Date.parse('2026-09-11T00:00:00Z')
const recentMessage = () => normalizeMessage({ messageId: '1', senderId: 'me', createdAt: new Date(now - 60000).toISOString(), status: 'SENT' })
beforeEach(() => {
  setActivePinia(createPinia())
  vi.restoreAllMocks()
  vi.mocked(http.get).mockReset()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  vi.spyOn(performance, 'now').mockReturnValue(1000)
})
describe('server-driven recall deadline', () => {
  it('uses the server clock rather than the workstation date, hides expired and non-sent messages', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: { recallWindowMs: 120000, serverTime: Date.parse('2026-09-11T00:00:00Z') } })
    const store = useMessagePolicyStore()
    await store.refresh()
    const message = normalizeMessage({ messageId: '1', senderId: 'me', createdAt: '2026-09-10T23:59:00Z', status: 'SENT' })
    expect(store.canRecall(message, 'me')).toBe(true)
    expect(store.canRecall(message, 'other')).toBe(false)
    for (const status of ['SENDING', 'FAILED', 'RECALLED']) expect(store.canRecall({ ...message, status }, 'me')).toBe(false)
    vi.mocked(performance.now).mockReturnValue(61000)
    expect(store.canRecall(message, 'me')).toBe(false)
  })
  it.each(['404', '500: policy matched the legacy conversation-id route', 'network timeout'])('retains the existing two-minute recall contract when policy fails: %s', async error => {
    vi.mocked(http.get).mockRejectedValue(new Error(error))
    const store = useMessagePolicyStore()
    await store.refresh()
    expect(store.canRecall(recentMessage(), 'me')).toBe(true)
    expect(store.canRecall(recentMessage(), 'other')).toBe(false)
    for (const status of ['SENDING', 'FAILED', 'RECALLED']) expect(store.canRecall({ ...recentMessage(), status }, 'me')).toBe(false)
    expect(store.canRecall({ ...recentMessage(), messageId: '' }, 'me')).toBe(false)
    expect(store.canRecall({ ...recentMessage(), createdAt: '' }, 'me')).toBe(false)
    expect(store.canRecall({ ...recentMessage(), createdAt: new Date(now + 60000).toISOString() }, 'me')).toBe(false)
    vi.mocked(performance.now).mockReturnValue(61000)
    expect(store.canRecall(recentMessage(), 'me')).toBe(false)
  })
  it('does not hide recent messages while the initial policy request is pending', async () => {
    let resolve!: (value: { data: { recallWindowMs: number; serverTime: number } }) => void
    vi.mocked(http.get).mockImplementation(() => new Promise(done => { resolve = done }))
    const store = useMessagePolicyStore()
    const refresh = store.refresh()
    expect(store.canRecall(recentMessage(), 'me')).toBe(true)
    resolve({ data: { recallWindowMs: 30000, serverTime: now } })
    await refresh
    expect(store.canRecall(recentMessage(), 'me')).toBe(false)
  })
  it.each([0, 30000, 180000])('preserves the authoritative %i ms policy during refresh failures', async recallWindowMs => {
    vi.mocked(http.get).mockResolvedValue({ data: { recallWindowMs, serverTime: now } })
    const store = useMessagePolicyStore()
    await store.refresh()
    const allowed = recallWindowMs > 60000
    expect(store.canRecall(recentMessage(), 'me')).toBe(allowed)
    vi.mocked(http.get).mockRejectedValue(new Error('offline'))
    const refresh = store.refresh()
    expect(store.canRecall(recentMessage(), 'me')).toBe(allowed)
    await refresh
    expect(store.canRecall(recentMessage(), 'me')).toBe(allowed)
  })
  it('does not extend the fallback deadline when the workstation clock changes', async () => {
    vi.mocked(http.get).mockRejectedValue(new Error('404'))
    const store = useMessagePolicyStore()
    await store.refresh()
    vi.mocked(Date.now).mockReturnValue(now - 3600000)
    vi.mocked(performance.now).mockReturnValue(61000)
    expect(store.canRecall(recentMessage(), 'me')).toBe(false)
    await store.refresh()
    expect(store.canRecall(recentMessage(), 'me')).toBe(false)
  })
  it('ignores malformed policy data without discarding the last valid policy', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: { recallWindowMs: 0, serverTime: now } })
    const store = useMessagePolicyStore()
    await store.refresh()
    for (const data of [null, {}, { recallWindowMs: -1, serverTime: now }, { recallWindowMs: 120000, serverTime: NaN }]) {
      vi.mocked(http.get).mockResolvedValue({ data })
      await store.refresh()
      expect(store.canRecall(recentMessage(), 'me')).toBe(false)
    }
  })
  it('resets account policy and ignores an old account response after reset', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: { recallWindowMs: 0, serverTime: now } })
    const store = useMessagePolicyStore()
    await store.refresh()
    let resolve!: (value: { data: { recallWindowMs: number; serverTime: number } }) => void
    vi.mocked(http.get).mockImplementation(() => new Promise(done => { resolve = done }))
    const refresh = store.refresh()
    store.reset()
    expect(store.canRecall(recentMessage(), 'me')).toBe(true)
    resolve({ data: { recallWindowMs: 0, serverTime: now } })
    await refresh
    expect(store.canRecall(recentMessage(), 'me')).toBe(true)
  })
})
