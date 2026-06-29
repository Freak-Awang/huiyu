// Intent: user wraps backend API calls so views and stores do not depend on raw HTTP details.
import http from './index'

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
  status: string
  createdAt: string
}

export function getProfile() {
  return http.get<UserProfile>('/api/users/me')
}

export function getUsersByDept(deptId?: string) {
  return http.get('/api/users/list', { params: { deptId } })
}

function normalizeUserPage(data: any) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.records)) return data.records
  if (Array.isArray(data?.data)) return data.data
  return []
}

export function searchUsers(keyword: string, page: number, pageSize: number) {
  return http.get('/api/users/search', { params: { keyword, page, pageSize } }).then((res) => {
    res.data = normalizeUserPage(res.data)
    return res
  })
}

export function updatePassword(oldPassword: string, newPassword: string) {
  return http.put('/api/users/password', { oldPassword, newPassword })
}

export function updateProfile(data: Partial<UserProfile>) {
  return http.put('/api/users/profile', data)
}
