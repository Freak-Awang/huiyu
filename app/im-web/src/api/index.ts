/**
 * HTTP 客户端：统一响应与单次认证恢复。启动校验/refresh 自行处理 401，
 * 普通请求等待同一个恢复任务，网络失败不会删除凭据。
 */
import axios from 'axios'
import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { getApiBaseUrl } from '../config/runtime'

declare module 'axios' {
  interface AxiosRequestConfig {
    skipAuthRecovery?: boolean
    authRetried?: boolean
    authUserId?: string
  }
}
let recovery: (() => Promise<boolean>) | undefined
let invalidate: (() => void) | undefined
export function configureSessionRecovery(restore: () => Promise<boolean>, clear: () => void) {
  recovery = restore
  invalidate = clear
}
export function isAuthenticationError(error: unknown) {
  const response = (error as AxiosError<{ code?: number }> | undefined)?.response
  return response?.status === 401 || response?.data?.code === 401
}
const http = axios.create({ baseURL: getApiBaseUrl(), timeout: 15000 })
http.interceptors.request.use((config) => {
  config.baseURL = getApiBaseUrl()
  const token = localStorage.getItem('token')
  config.authUserId ??= localStorage.getItem('imCurrentUserId') || ''
  if (token && !config.headers.Authorization && config.url !== '/api/auth/login') {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
async function rejectOrRecover(error: AxiosError) {
  const config = error.config || error.response?.config
  if (!isAuthenticationError(error) || !config || config.skipAuthRecovery || !recovery) throw error
  const token = localStorage.getItem('token')
  if (!token) throw error
  if (config.authUserId !== (localStorage.getItem('imCurrentUserId') || '')) throw error
  // 旧账号/旧 token 的迟到 401 不能清理新会话。
  if (config.headers.Authorization !== `Bearer ${token}`) {
    config.headers.Authorization = `Bearer ${token}`
    if (!config.authRetried) return retry(config)
    throw error
  }
  if (config.authRetried) { invalidate?.(); throw error }
  if (!await recovery()) throw error
  const restoredToken = localStorage.getItem('token')
  if (!restoredToken) throw error
  config.headers.Authorization = `Bearer ${restoredToken}`
  return retry(config)
}
function retry(config: InternalAxiosRequestConfig) {
  config.authRetried = true
  return http.request(config)
}
http.interceptors.response.use((response: AxiosResponse) => {
  const body = response.data
  if (body && typeof body === 'object' && 'code' in body) {
    if (body.code === 200) { response.data = body.data; return response }
    const error = new axios.AxiosError(body.message || '请求失败', undefined, response.config, undefined,
      { ...response, status: body.code === 401 ? 401 : response.status, data: body })
    return rejectOrRecover(error)
  }
  return response
}, rejectOrRecover)
export default http
