import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
vi.mock('../api/index', () => ({ default: { get: vi.fn() } }))
import http from '../api/index'
import { normalizeMessage } from '../api/message'
import { useMessagePolicyStore } from './messagePolicy'
beforeEach(() => { setActivePinia(createPinia()); vi.restoreAllMocks(); vi.spyOn(performance, 'now').mockReturnValue(1000) })
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
  it('fails closed for older/offline servers and resets on account changes', async () => {
    vi.mocked(http.get).mockRejectedValue(new Error('404'))
    const store = useMessagePolicyStore()
    await store.refresh()
    expect(store.canRecall(normalizeMessage({ messageId: '1', senderId: 'me' }), 'me')).toBe(false)
    store.reset()
  })
})
