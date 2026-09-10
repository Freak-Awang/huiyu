import { beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import http, { configureSessionRecovery } from './index'
vi.mock('../config/runtime', () => ({ getApiBaseUrl: () => 'https://server.test' }))
let storage: Map<string, string>
let recover = vi.fn(async () => true)
let invalidate = vi.fn(() => undefined)
beforeEach(() => {
  storage = new Map([['token', 'old-session'], ['imCurrentUserId', '42']])
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  recover = vi.fn(async () => { storage.set('token', 'new-session'); return true })
  invalidate = vi.fn()
  configureSessionRecovery(recover, invalidate)
})
describe('HTTP session recovery', () => {
  it('recovers a business 401 and retries once with the rotated token', async () => {
    let requests = 0
    http.defaults.adapter = async (config) => {
      requests++
      if (requests === 1) return { config, data: { code: 401 }, status: 200, statusText: 'OK', headers: {} }
      expect(config.headers.Authorization).toBe('Bearer new-session')
      return { config, data: { code: 200, data: 'done' }, status: 200, statusText: 'OK', headers: {} }
    }
    expect((await http.get('/test')).data).toBe('done')
    expect(recover).toHaveBeenCalledTimes(1)
    expect(requests).toBe(2)
  })
  it('does not recursively recover bootstrap / refresh requests', async () => {
    http.defaults.adapter = async (config) => ({ config, data: { code: 401 }, status: 200, statusText: 'OK', headers: {} })
    await expect(http.get('/api/users/me', { skipAuthRecovery: true })).rejects.toThrow()
    expect(recover).not.toHaveBeenCalled()
    expect(invalidate).not.toHaveBeenCalled()
    expect(storage.get('token')).toBe('old-session')
  })
  it('stops after a retried HTTP request still receives 401', async () => {
    http.defaults.adapter = async (config) => {
      throw new axios.AxiosError('unauthorized', undefined, config, undefined,
        { config, data: {}, status: 401, statusText: 'Unauthorized', headers: {} })
    }
    await expect(http.get('/test')).rejects.toThrow()
    expect(recover).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledTimes(1)
  })
  it('does not clear a token for transport errors', async () => {
    http.defaults.adapter = async () => { throw new Error('connection refused') }
    await expect(http.get('/test')).rejects.toThrow('connection refused')
    expect(recover).not.toHaveBeenCalled()
    expect(invalidate).not.toHaveBeenCalled()
    expect(storage.get('token')).toBe('old-session')
  })
  it('never replays an old account request under a newly logged-in account', async () => {
    http.defaults.adapter = async (config) => {
      storage.set('token', 'another-account-session')
      storage.set('imCurrentUserId', '99')
      return { config, data: { code: 401 }, status: 200, statusText: 'OK', headers: {} }
    }
    await expect(http.post('/sensitive-operation')).rejects.toThrow()
    expect(recover).not.toHaveBeenCalled()
    expect(invalidate).not.toHaveBeenCalled()
  })
})
