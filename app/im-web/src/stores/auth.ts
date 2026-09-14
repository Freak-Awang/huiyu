/**
 * 认证 Store：管理用户登录状态、Token 及当前用户信息，
 * 提供登录、登出、从本地存储恢复会话及更新用户资料等能力。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as loginApi, logout as logoutApi, refreshSession } from '../api/auth'
import { isAuthenticationError } from '../api'
import { getProfile } from '../api/user'
import { toServerUrl } from '../config/runtime'
import { useUserProfileStore } from './userProfiles'

/**
 * 当前登录用户信息。
 */
export interface UserInfo {
  /** 用户唯一标识 */
  userId: string
  /** 登录用户名 */
  username: string
  /** 用户昵称 */
  nickname: string
  /** 头像 URL */
  avatar: string
  /** 个性签名 */
  signature: string
  /** 用户角色 */
  role: string
  /** 邮箱 */
  email?: string
  /** 手机号 */
  phone?: string
  /** 所属部门 ID */
  deptId?: string
  /** 所属部门名称 */
  deptName?: string
  /** 账号状态 */
  status?: string | number
  /** 资料最后更新时间 */
  updatedAt?: string
}

/**
 * 认证 Store：管理登录 Token 与当前用户信息。
 * state: token - JWT 访问令牌；user - 当前登录用户资料
 */
export const useAuthStore = defineStore('auth', () => {
  /** JWT 访问令牌 */
  const token = ref('')
  /** 当前登录用户信息 */
  const user = ref<UserInfo | null>(null)
  const authState = ref<'initializing' | 'authenticated' | 'unauthenticated'>('initializing')
  const restoreError = ref('')
  const restoring = ref(false)
  let restorePromise: Promise<void> | null = null
  let generation = 0

  const isLoggedIn = computed(() => authState.value === 'authenticated' && !!token.value)
  const currentUser = computed(() => user.value)

  /**
   * 用户登录：调用登录接口，保存 Token 并初始化用户信息。
   * @param username 用户名
   * @param password 密码
   * @param autoLogin 是否在下次启动时自动登录，默认关闭
   */
  async function login(username: string, password: string, autoLogin = false) {
    const loginGeneration = ++generation
    const res = await loginApi(username, password)
    if (loginGeneration !== generation) return
    const data = res.data
    token.value = data.token
    localStorage.setItem('token', data.token)
    localStorage.setItem('autoLogin', String(autoLogin))
    const u = data.user || data
    if (u.userId || u.id) {
      user.value = {
        userId: String(u.userId || u.id),
        username: u.username || username,
        nickname: u.nickname || '',
        avatar: normalizeAvatar(u.avatar),
        signature: u.signature || '',
        role: u.role || '',
        email: u.email || '',
        phone: u.phone || '',
        deptId: u.deptId ? String(u.deptId) : '',
        deptName: u.deptName || '',
        status: u.status ?? '',
        updatedAt: u.updatedAt || u.updateTime || '',
      }
      localStorage.setItem('imCurrentUserId', user.value.userId)
      useUserProfileStore().upsertProfile(user.value)
    }
    authState.value = 'authenticated'
    restoreError.value = ''
  }

  /** 用户登出：调用登出接口并清理本地状态与缓存 */
  async function logout() {
    const previousToken = token.value
    clearAuth()
    try {
      await logoutApi(previousToken)
    } catch {
      // ignore logout API errors
    }
  }

  /** 仅显式退出账号或确定的认证失效调用，不用于应用退出/网络失败。 */
  function clearAuth() {
    generation++
    token.value = ''
    user.value = null
    useUserProfileStore().clear()
    localStorage.removeItem('token')
    localStorage.removeItem('imCurrentUserId')
    authState.value = 'unauthenticated'
    restoreError.value = ''
  }

  /** 按自动登录偏好恢复启动会话；当前已登录会话仍可续期。 */
  function restoreSession(force = false): Promise<void> {
    if (restorePromise) return restorePromise
    if (!force && authState.value !== 'initializing') return Promise.resolve()
    // force 只允许重新验证，不能绕过启动时的自动登录选择。
    // 内存 token 表示本次运行已经登录或开始恢复，网络重试不受此偏好影响。
    if (!token.value && localStorage.getItem('autoLogin') !== 'true') {
      authState.value = 'unauthenticated'
      restoreError.value = ''
      return Promise.resolve()
    }
    restorePromise = restore().finally(() => { restorePromise = null; restoring.value = false })
    return restorePromise
  }

  async function restore() {
    const restoreGeneration = generation
    const savedToken = localStorage.getItem('token')
    if (!savedToken) { clearAuth(); return }
    console.info('[Auth] restoring session')
    authState.value = 'initializing'
    restoring.value = true
    restoreError.value = ''
    token.value = savedToken
    try {
      let res
      try {
        res = await getProfile({ skipAuthRecovery: true })
        console.info('[Auth] access token valid')
      } catch (error) {
        if (!isAuthenticationError(error)) throw error
        if (restoreGeneration !== generation) return
        console.info('[Auth] refreshing token')
        const refreshed = await refreshSession(savedToken)
        if (restoreGeneration !== generation) return
        if (!refreshed.data?.token || typeof refreshed.data.token !== 'string') {
          clearAuth()
          console.info('[Auth] session invalid')
          return
        }
        // 轮换成功后立即保存；后续 profile 网络失败也不能丢掉新 token。
        token.value = refreshed.data.token
        localStorage.setItem('token', token.value)
        res = await getProfile({ skipAuthRecovery: true })
      }
      if (restoreGeneration !== generation) return
      const body = res.data as any
      const data = body.data || body
      if (!data.userId && !data.id) { clearAuth(); console.info('[Auth] session invalid'); return }
      user.value = {
        userId: String(data.userId || data.id || ''),
        username: data.username || '',
        nickname: data.nickname || '',
        avatar: normalizeAvatar(data.avatar),
        signature: data.signature || '',
        role: data.role || '',
        email: data.email || '',
        phone: data.phone || '',
        deptId: data.deptId ? String(data.deptId) : '',
        deptName: data.deptName || '',
        status: data.status ?? '',
        updatedAt: data.updatedAt || data.updateTime || '',
      }
      localStorage.setItem('imCurrentUserId', user.value.userId)
      useUserProfileStore().upsertProfile({ ...user.value, updatedAt: data.updatedAt || data.updateTime || '' })
      authState.value = 'authenticated'
      console.info('[Auth] session restored')
    } catch (error) {
      if (restoreGeneration !== generation) return
      if (isAuthenticationError(error)) {
        clearAuth()
        console.info('[Auth] session invalid')
      } else {
        // 暂不可验证：保留所有凭据，停留启动页重试，不挂载依赖用户资料的聊天页。
        restoreError.value = '暂时无法连接服务器，正在等待重试。'
        console.info('[Auth] network unavailable')
      }
    }
  }

  /** 初始化认证状态（应用启动时调用） */
  function init() {
    return restoreSession()
  }

  /**
   * 更新当前用户信息（局部更新）。
   * @param patch 待更新的用户字段
   */
  function updateCurrentUser(patch: Partial<UserInfo>) {
    if (!user.value) return
    user.value = {
      ...user.value,
      ...patch,
      avatar: patch.avatar !== undefined ? normalizeAvatar(patch.avatar) : user.value.avatar,
    }
    useUserProfileStore().upsertProfile(user.value)
  }

  function normalizeAvatar(avatar?: string | null) {
    return avatar ? toServerUrl(avatar) : ''
  }

  return { token, user, authState, restoreError, restoring, isLoggedIn, currentUser,
    login, logout, clearAuth, restoreSession, loadFromStorage: restoreSession, init, updateCurrentUser }
})
