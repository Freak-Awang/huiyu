// Intent: user wraps backend API calls so views and stores do not depend on raw HTTP details.
import http from './index'
import { toServerUrl } from '../config/runtime'

export interface UserProfile {
  userId: string
  username: string
  nickname: string
  avatar: string
  signature: string
  email: string
  phone: string
  deptId: string
  deptName: string
  role: string
  remark: string
  status: string | number
  createdAt?: string
  updatedAt: string
}

export function getProfile() {
  return http.get<UserProfile>('/api/users/me').then((res) => ({
    ...res,
    data: normalizeUserProfile(res.data),
  }))
}

export function getUserProfile(userId: string | number) {
  return http.get<UserProfile>(`/api/users/${userId}`).then((res) => ({
    ...res,
    data: normalizeUserProfile(res.data),
  }))
}

export function getUsersByDept(deptId?: string) {
  return http.get('/api/users/list', { params: { deptId } }).then((res) => ({
    ...res,
    data: normalizeUsers(res.data),
  }))
}

export function normalizeUser<T extends Record<string, any>>(user: T): T {
  return {
    ...user,
    userId: String(user.userId ?? user.id ?? ''),
    deptId: user.deptId == null ? '' : String(user.deptId),
    avatar: user.avatar ? toServerUrl(user.avatar) : '',
    updatedAt: user.updatedAt || user.updateTime || '',
  }
}

export function normalizeUserProfile(user: Record<string, any>): UserProfile {
  const normalized = normalizeUser(user)
  return {
    userId: normalized.userId,
    username: normalized.username || '',
    nickname: normalized.nickname || '',
    avatar: normalized.avatar || '',
    signature: normalized.signature || '',
    email: normalized.email || '',
    phone: normalized.phone || '',
    deptId: normalized.deptId || '',
    deptName: normalized.deptName || '',
    role: normalized.role || '',
    remark: normalized.remark || '',
    status: normalized.status ?? '',
    createdAt: normalized.createdAt || normalized.createTime || '',
    updatedAt: normalized.updatedAt || '',
  }
}

function normalizeUsers(data: any) {
  const users = Array.isArray(data)
    ? data
    : Array.isArray(data?.records)
      ? data.records
      : Array.isArray(data?.data)
        ? data.data
        : []
  return users.map(normalizeUser)
}

export function searchUsers(keyword: string, page: number, pageSize: number) {
  return http.get('/api/users/search', { params: { keyword, page, pageSize } }).then((res) => ({
    ...res,
    data: normalizeUsers(res.data),
  }))
}

export function updatePassword(oldPassword: string, newPassword: string) {
  return http.put('/api/users/password', { oldPassword, newPassword })
}

export function updateProfile(data: Partial<UserProfile>) {
  return http.put<UserProfile>('/api/users/profile', data).then((res) => ({
    ...res,
    data: normalizeUserProfile(res.data),
  }))
}
