/**
 * 认证 Store：管理用户登录状态、Token 及当前用户信息，
 * 提供登录、登出、从本地存储恢复会话及更新用户资料等能力。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as loginApi, logout as logoutApi } from '../api/auth'
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

  const isLoggedIn = computed(() => !!token.value)
  const currentUser = computed(() => user.value)

  /**
   * 用户登录：调用登录接口，保存 Token 并初始化用户信息。
   * @param username 用户名
   * @param password 密码
   */
  async function login(username: string, password: string) {
    const res = await loginApi(username, password)
    const data = res.data
    token.value = data.token
    localStorage.setItem('token', data.token)
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
  }

  /** 用户登出：调用登出接口并清理本地状态与缓存 */
  async function logout() {
    try {
      await logoutApi()
    } catch {
      // ignore logout API errors
    }
    token.value = ''
    user.value = null
    useUserProfileStore().clear()
    localStorage.removeItem('token')
    localStorage.removeItem('imCurrentUserId')
  }

  /** 从 localStorage 恢复登录状态，并拉取最新用户资料 */
  async function loadFromStorage() {
    const savedToken = localStorage.getItem('token')
    if (!savedToken) return
    token.value = savedToken
    try {
      const res = await getProfile()
      const body = res.data as any
      const data = body.data || body
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
    } catch {
      token.value = ''
      user.value = null
      localStorage.removeItem('token')
      localStorage.removeItem('imCurrentUserId')
      useUserProfileStore().clear()
    }
  }

  /** 初始化认证状态（应用启动时调用） */
  function init() {
    return loadFromStorage()
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

  return { token, user, isLoggedIn, currentUser, login, logout, loadFromStorage, init, updateCurrentUser }
})
