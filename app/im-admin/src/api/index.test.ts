import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { showError, navigate, storage } = vi.hoisted(() => ({
  showError: vi.fn(),
  navigate: vi.fn(),
  storage: { getItem: vi.fn(), removeItem: vi.fn() },
}))

vi.mock('element-plus', () => ({ ElMessage: { error: showError } }))
vi.mock('../router', () => ({ default: { push: navigate } }))

import client from './index'

function response(config: InternalAxiosRequestConfig, status: number, data: unknown): AxiosResponse {
  return { config, status, statusText: '', headers: new AxiosHeaders(), data }
}

describe('admin authentication errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('localStorage', storage)
  })

  it.each([true, false])('preserves login failure for HTTP 401 / business 401 (HTTP=%s)', async (httpError) => {
    const data = { code: 401, message: '用户名或密码错误', data: null }
    await expect(client.post('/api/auth/login', { username: 'sample', password: 'wrong-password' }, {
      adapter: async (config) => {
        const result = response(config, httpError ? 401 : 200, data)
        if (httpError) throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, result)
        return result
      },
    })).rejects.toThrow()
    expect(showError).toHaveBeenCalledExactlyOnceWith('用户名或密码错误')
    expect(storage.removeItem).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('uses a login-specific fallback when the response has no message', async () => {
    await expect(client.post('/api/auth/login', {}, {
      adapter: async (config) => {
        throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, response(config, 401, {}))
      },
    })).rejects.toThrow()
    expect(showError).toHaveBeenCalledExactlyOnceWith('用户名或密码错误')
  })

  it.each([true, false])('still expires protected requests (HTTP=%s)', async (httpError) => {
    await expect(client.get('/api/admin/users/page', {
      adapter: async (config) => {
        const result = response(config, httpError ? 401 : 200, { code: 401, message: 'Token expired', data: null })
        if (httpError) throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, result)
        return result
      },
    })).rejects.toThrow()
    expect(storage.removeItem).toHaveBeenCalledWith('token')
    expect(storage.removeItem).toHaveBeenCalledWith('user')
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/login')
    if (httpError) expect(showError).toHaveBeenCalledExactlyOnceWith('登录已过期，请重新登录')
  })

  it('unwraps a successful login', async () => {
    const result = await client.post('/api/auth/login', {}, {
      adapter: async (config) => response(config, 200, { code: 200, data: { token: 'test-token' } }),
    })
    expect(result.data).toEqual({ token: 'test-token' })
    expect(showError).not.toHaveBeenCalled()
  })
})
