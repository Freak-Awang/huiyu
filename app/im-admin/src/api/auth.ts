// ?????auth wraps backend API calls so views and stores do not depend on raw HTTP details.
import client from './index'

export interface LoginParams {
    username: string
    password: string
}

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

export function login(data: LoginParams) {
    return client.post<LoginResult>('/api/auth/login', data)
}

export function logout() {
    return client.post('/api/auth/logout')
}
