/**
 * 认证状态管理（Pinia）
 * 集中维护登录 token、当前用户信息及登录/退出等副作用，供路由守卫与布局组件使用。
 */
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

    /** 登录成功后写入 token 与用户信息，并持久化到 localStorage */
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

    /** 退出登录：调用后端注销接口，清理本地状态并跳转登录页 */
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

    /** 从 localStorage 恢复登录态，用于路由守卫初始化 */
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
