import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
vi.mock('../api/auth', () => ({ login: vi.fn(), logout: vi.fn(), refreshSession: vi.fn() }))
vi.mock('../api/user', () => ({ getProfile: vi.fn() }))
vi.mock('./userProfiles', () => ({ useUserProfileStore: () => ({ clear: vi.fn(), upsertProfile: vi.fn() }) }))
vi.mock('../api', () => ({
  isAuthenticationError: (error: any) => error?.response?.status === 401 || error?.response?.data?.code === 401,
}))
import { useAuthStore } from './auth'
import { getProfile } from '../api/user'
import { login, logout, refreshSession } from '../api/auth'

const validProfile = { data: { userId: '42', username: 'test', nickname: '用户' } } as any
const unauthorized = { response: { status: 401 } }
let storage: Map<string, string>
beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
  storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
})
describe('session bootstrap', () => {
  it('settles unauthenticated without credentials and does not call the server', async () => {
    const auth = useAuthStore()
    expect(auth.authState).toBe('initializing')
    await auth.restoreSession()
    expect(auth.authState).toBe('unauthenticated')
    expect(getProfile).not.toHaveBeenCalled()
  })
  it.each([undefined, 'false'])('does not restore saved credentials without opting in (%s), even when forced', async (preference) => {
    storage.set('token', 'saved-session')
    storage.set('imCurrentUserId', '42')
    storage.set('rememberMe', 'true')
    if (preference !== undefined) storage.set('autoLogin', preference)
    const auth = useAuthStore()
    await auth.init()
    await auth.restoreSession(true)
    expect(auth.authState).toBe('unauthenticated')
    expect(auth.isLoggedIn).toBe(false)
    expect(auth.token).toBe('')
    expect(auth.user).toBeNull()
    expect(auth.restoreError).toBe('')
    expect(storage.get('token')).toBe('saved-session')
    expect(storage.get('imCurrentUserId')).toBe('42')
    expect(getProfile).not.toHaveBeenCalled()
    expect(refreshSession).not.toHaveBeenCalled()
    expect(logout).not.toHaveBeenCalled()
  })
  it('restores an opted-in valid session and does not validate twice', async () => {
    storage.set('token', 'saved-session')
    storage.set('autoLogin', 'true')
    vi.mocked(getProfile).mockResolvedValue(validProfile)
    const auth = useAuthStore()
    await Promise.all([auth.restoreSession(), auth.init()])
    await auth.init()
    expect(auth.isLoggedIn).toBe(true)
    expect(auth.user?.userId).toBe('42')
    expect(getProfile).toHaveBeenCalledTimes(1)
    expect(logout).not.toHaveBeenCalled()
    expect(refreshSession).not.toHaveBeenCalled()
  })
  it('waits for validation instead of treating the stored token as authenticated', async () => {
    storage.set('autoLogin', 'true')
    storage.set('token', 'saved-session')
    let resolve!: (value: any) => void
    vi.mocked(getProfile).mockReturnValue(new Promise((done) => { resolve = done }))
    const auth = useAuthStore()
    const pending = auth.restoreSession()
    expect(auth.isLoggedIn).toBe(false)
    expect(auth.authState).toBe('initializing')
    resolve(validProfile)
    await pending
    expect(auth.authState).toBe('authenticated')
  })
  it('uses the existing refresh API after 401 and persists a rotated token before fetching the profile', async () => {
    storage.set('autoLogin', 'true')
    storage.set('token', 'old-session')
    vi.mocked(getProfile).mockRejectedValueOnce(unauthorized).mockImplementationOnce(async () => {
      expect(storage.get('token')).toBe('rotated-session')
      return validProfile
    })
    vi.mocked(refreshSession).mockResolvedValue({ data: { token: 'rotated-session' } } as any)
    const auth = useAuthStore()
    await auth.restoreSession()
    expect(refreshSession).toHaveBeenCalledWith('old-session')
    expect(auth.isLoggedIn).toBe(true)
  })
  it('clears credentials only after refresh explicitly rejects the session', async () => {
    storage.set('autoLogin', 'true')
    storage.set('token', 'expired-session')
    storage.set('imCurrentUserId', '42')
    vi.mocked(getProfile).mockRejectedValue(unauthorized)
    vi.mocked(refreshSession).mockRejectedValue(unauthorized)
    const auth = useAuthStore()
    await auth.restoreSession()
    expect(auth.authState).toBe('unauthenticated')
    expect(storage.has('token')).toBe(false)
    expect(logout).not.toHaveBeenCalled()
  })
  it.each([new Error('network unavailable'), { code: 'ETIMEDOUT' }, { response: { status: 503 } }])(
    'preserves credentials on temporary profile failure and retries successfully', async (error) => {
      storage.set('autoLogin', 'true')
      storage.set('token', 'saved-session')
      storage.set('imCurrentUserId', '42')
      vi.mocked(getProfile).mockRejectedValueOnce(error).mockResolvedValueOnce(validProfile)
      const auth = useAuthStore()
      await auth.restoreSession()
      expect(storage.get('token')).toBe('saved-session')
      expect(storage.get('imCurrentUserId')).toBe('42')
      expect(auth.authState).toBe('initializing')
      expect(auth.restoreError).not.toBe('')
      await auth.restoreSession()
      expect(auth.isLoggedIn).toBe(true)
    })
  it('keeps the old token when refresh times out', async () => {
    storage.set('autoLogin', 'true')
    storage.set('token', 'saved-session')
    vi.mocked(getProfile).mockRejectedValue(unauthorized)
    vi.mocked(refreshSession).mockRejectedValue(new Error('timeout'))
    const auth = useAuthStore()
    await auth.restoreSession()
    expect(storage.get('token')).toBe('saved-session')
    expect(auth.authState).toBe('initializing')
  })
  it('keeps a successfully rotated token even if the next profile request fails', async () => {
    storage.set('autoLogin', 'true')
    storage.set('token', 'old-session')
    vi.mocked(getProfile).mockRejectedValueOnce(unauthorized).mockRejectedValueOnce(new Error('offline'))
    vi.mocked(refreshSession).mockResolvedValue({ data: { token: 'new-session' } } as any)
    await useAuthStore().restoreSession()
    expect(storage.get('token')).toBe('new-session')
    expect(useAuthStore().authState).toBe('initializing')
  })
  it('does not resurrect an account from a late restore response after explicit logout', async () => {
    storage.set('autoLogin', 'true')
    storage.set('token', 'saved-session')
    let resolve!: (value: any) => void
    vi.mocked(getProfile).mockReturnValue(new Promise((done) => { resolve = done }))
    const auth = useAuthStore()
    const pending = auth.restoreSession()
    await auth.logout()
    resolve(validProfile)
    await pending
    expect(auth.authState).toBe('unauthenticated')
    expect(storage.has('token')).toBe(false)
    expect(logout).toHaveBeenCalledWith('saved-session')
  })
  it.each([undefined, false, true])('persists the login choice and respects it on the next launch (%s)', async (preference) => {
    storage.set('autoLogin', 'true')
    vi.mocked(login).mockResolvedValue({ data: { token: 'new-login', userId: '42' } } as any)
    vi.mocked(getProfile).mockResolvedValue(validProfile)
    const auth = useAuthStore()
    await auth.login('test', 'test-only', preference)
    expect(auth.authState).toBe('authenticated')
    expect(storage.get('token')).toBe('new-login')
    expect(storage.get('autoLogin')).toBe(String(preference === true))
    setActivePinia(createPinia())
    const restartedAuth = useAuthStore()
    await restartedAuth.init()
    expect(restartedAuth.isLoggedIn).toBe(preference === true)
    expect(getProfile).toHaveBeenCalledTimes(preference === true ? 1 : 0)
  })
  it('still refreshes a manually logged-in session when automatic login is disabled', async () => {
    vi.mocked(login).mockResolvedValue({ data: { token: 'manual-session', userId: '42' } } as any)
    vi.mocked(getProfile).mockRejectedValueOnce(unauthorized).mockResolvedValueOnce(validProfile)
    vi.mocked(refreshSession).mockResolvedValue({ data: { token: 'rotated-session' } } as any)
    const auth = useAuthStore()
    await auth.init()
    await auth.login('test', 'test-only', false)
    await auth.restoreSession(true)
    expect(refreshSession).toHaveBeenCalledWith('manual-session')
    expect(auth.isLoggedIn).toBe(true)
    expect(storage.get('token')).toBe('rotated-session')
    expect(storage.get('autoLogin')).toBe('false')
  })
  it('does not enable automatic login when the login attempt fails', async () => {
    vi.mocked(login).mockRejectedValue(unauthorized)
    const auth = useAuthStore()
    await auth.init()
    await expect(auth.login('test', 'test-only', true)).rejects.toEqual(unauthorized)
    expect(storage.has('autoLogin')).toBe(false)
    expect(auth.isLoggedIn).toBe(false)
  })
})
