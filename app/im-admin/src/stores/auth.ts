// ?????auth keeps shared UI state and side effects in one Pinia store.
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as loginApi, logout as logoutApi, type LoginResult } from '../api/auth'
import router from '../router'

type AdminUser = NonNullable<LoginResult['user']>

export const useAuthStore = defineStore('auth', () => {
    const token = ref<string>(localStorage.getItem('token') || '')
    const user = ref<AdminUser | null>(
        JSON.parse(localStorage.getItem('user') || 'null'),
    )

    const isLoggedIn = computed(() => !!token.value)
    const nickname = computed(() => user.value?.nickname || '管理员')
    const role = computed(() => user.value?.role || '')

    async function login(username: string, password: string) {
        const res = await loginApi({ username, password })
        const data = res.data
        token.value = data.token
        user.value = data.user || {
            id: data.userId || 0,
            username: username,
            nickname: data.nickname || username,
            email: '',
            phone: '',
            avatar: data.avatar || '',
            role: data.role || '',
            deptId: data.deptId || 0,
            status: 1,
        }
        localStorage.setItem('token', data.token)
        localStorage.setItem('user', JSON.stringify(user.value))
    }

    async function logout() {
        try {
            await logoutApi()
        } catch {
            // ignore
        }
        token.value = ''
        user.value = null
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        router.push('/login')
    }

    function init() {
        const savedToken = localStorage.getItem('token')
        const savedUser = localStorage.getItem('user')
        if (savedToken && savedUser) {
            token.value = savedToken
            user.value = JSON.parse(savedUser)
        }
    }

    return { token, user, isLoggedIn, nickname, role, login, logout, init }
})
