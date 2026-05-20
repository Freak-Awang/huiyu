import client from './index'

export interface UserPageParams {
    keyword?: string
    status?: number
    page?: number
    pageSize?: number
}

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

export function getUsersPage(params: UserPageParams) {
    return client.get('/api/admin/users/page', { params })
}

export function createUser(data: UserData) {
    return client.post('/api/admin/users', data)
}

export function updateUser(data: UserData) {
    return client.put('/api/admin/users', data)
}

export function deleteUser(id: number) {
    return client.delete(`/api/admin/users/${id}`)
}

export function updateUserStatus(id: number, status: number) {
    return client.put(`/api/admin/users/${id}/status`, null, { params: { status } })
}
