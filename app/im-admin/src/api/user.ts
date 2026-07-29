/**
 * 用户管理 API
 * 提供用户分页查询、增删改、状态切换及密码重置等接口封装。
 */
import client from './index'

/** 用户分页查询参数 */
export interface UserPageParams {
    keyword?: string
    status?: number
    page?: number
    pageSize?: number
}

/** 用户数据模型 */
export interface UserData {
    id?: number
    username: string
    password?: string
    nickname: string
    email?: string
    phone?: string
    role: string
    deptId?: number
    status: number
}

/**
 * 分页查询用户列表
 * GET /api/admin/users/page
 */
export function getUsersPage(params: UserPageParams) {
    return client.get('/api/admin/users/page', { params })
}

/**
 * 创建用户
 * POST /api/admin/users
 */
export function createUser(data: UserData) {
    return client.post('/api/admin/users', data)
}

/**
 * 更新用户
 * PUT /api/admin/users
 */
export function updateUser(data: UserData) {
    return client.put('/api/admin/users', data)
}

/**
 * 删除用户
 * DELETE /api/admin/users/{id}
 */
export function deleteUser(id: number) {
    return client.delete(`/api/admin/users/${id}`)
}

/**
 * 启用/禁用用户
 * PUT /api/admin/users/{id}/status
 */
export function updateUserStatus(id: number, status: number) {
    return client.put(`/api/admin/users/${id}/status`, null, { params: { status } })
}

/**
 * 重置用户密码
 * PUT /api/admin/users/{id}/password/reset
 */
export function resetUserPassword(id: number, newPassword: string) {
    return client.put(`/api/admin/users/${id}/password/reset`, { newPassword })
}
