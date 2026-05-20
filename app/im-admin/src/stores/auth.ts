import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as loginApi, logout as logoutApi, type LoginResult } from '../api/auth'
import router from '../router'

export const useAuthStore = defineStore('auth', () => {
    const token = ref<string>(localStorage.getItem('token') || '')
    const user = ref<LoginResult['user'] | null>(
        JSON.parse(localStorage.getItem('user') || 'null'),
    )

    const isLoggedIn = computed(() => !!token.value)
    const nickname = computed(() => user.value?.nickname || '管理员')
    const role = computed(() => user.value?.role || '')

    async function login(username: string, password: string) {
        const res = await loginApi({ username, password })
        const data = res.data
        token.value = data.token
        user.value = data.user
        localStorage.setItem('token', data.token)
        localStorage.setItem('user', JSON.stringify(data.user))
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
