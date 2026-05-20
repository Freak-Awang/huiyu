import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as loginApi, logout as logoutApi } from '../api/auth'
import { getProfile } from '../api/user'

export interface UserInfo {
  userId: string
  username: string
  nickname: string
  avatar: string
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
    if (data.user) {
      user.value = {
        userId: data.user.userId || data.user.id,
        username: data.user.username,
        nickname: data.user.nickname,
        avatar: data.user.avatar || '',
        role: data.user.role || '',
        email: data.user.email,
        phone: data.user.phone,
        deptId: data.user.deptId,
        deptName: data.user.deptName,
      }
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
  }

  async function loadFromStorage() {
    const savedToken = localStorage.getItem('token')
    if (!savedToken) return
    token.value = savedToken
    try {
      const res = await getProfile()
      const data = res.data
      user.value = {
        userId: data.userId,
        username: data.username,
        nickname: data.nickname,
        avatar: data.avatar || '',
        role: data.role || '',
        email: data.email,
        phone: data.phone,
        deptId: data.deptId,
        deptName: data.deptName,
      }
    } catch {
      token.value = ''
      user.value = null
      localStorage.removeItem('token')
    }
  }

  function init() {
    return loadFromStorage()
  }

  return { token, user, isLoggedIn, currentUser, login, logout, loadFromStorage, init }
})
