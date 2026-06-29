// ?????auth keeps shared UI state and side effects in one Pinia store.
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as loginApi, logout as logoutApi } from '../api/auth'
import { getProfile } from '../api/user'
import { toServerUrl } from '../config/runtime'

export interface UserInfo {
  userId: string
  username: string
  nickname: string
  avatar: string
  signature: string
  role: string
  email?: string
  phone?: string
  deptId?: string
  deptName?: string
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref('')
  const user = ref<UserInfo | null>(null)

  const isLoggedIn = computed(() => !!token.value)
  const currentUser = computed(() => user.value)

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
      }
      localStorage.setItem('imCurrentUserId', user.value.userId)
    }
  }

  async function logout() {
    try {
      await logoutApi()
    } catch {
      // ignore logout API errors
    }
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('imCurrentUserId')
  }

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
      }
      localStorage.setItem('imCurrentUserId', user.value.userId)
    } catch {
      token.value = ''
      user.value = null
      localStorage.removeItem('token')
      localStorage.removeItem('imCurrentUserId')
    }
  }

  function init() {
    return loadFromStorage()
  }

  function updateCurrentUser(patch: Partial<UserInfo>) {
    if (!user.value) return
    user.value = {
      ...user.value,
      ...patch,
      avatar: patch.avatar !== undefined ? normalizeAvatar(patch.avatar) : user.value.avatar,
    }
  }

  function normalizeAvatar(avatar?: string | null) {
    return avatar ? toServerUrl(avatar) : ''
  }

  return { token, user, isLoggedIn, currentUser, login, logout, loadFromStorage, init, updateCurrentUser }
})
