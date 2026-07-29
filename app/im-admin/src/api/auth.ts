/**
 * 认证相关 API
 * 封装登录、退出等后端接口调用，视图层与状态层无需关心原始 HTTP 细节。
 */
import client from './index'

/** 登录请求参数 */
export interface LoginParams {
    username: string
    password: string
}

/** 登录响应结果 */
export interface LoginResult {
    token: string
    userId?: number
    nickname?: string
    avatar?: string
    role?: string
    deptId?: number
    user?: {
        id: number
        username: string
        nickname: string
        email: string
        phone: string
        avatar: string
        role: string
        deptId: number
        status: number
    }
}

/**
 * 管理员登录
 * POST /api/auth/login
 */
export function login(data: LoginParams) {
    return client.post<LoginResult>('/api/auth/login', data)
}

/**
 * 退出登录
 * POST /api/auth/logout
 */
export function logout() {
    return client.post('/api/auth/logout')
}
