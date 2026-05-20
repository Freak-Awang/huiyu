import http from './index'

export interface UserProfile {
  userId: string
  username: string
  nickname: string
  avatar: string
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

export function searchUsers(keyword: string, page: number, pageSize: number) {
  return http.get('/api/users/search', { params: { keyword, page, pageSize } })
}

export function updatePassword(oldPassword: string, newPassword: string) {
  return http.put('/api/users/password', { oldPassword, newPassword })
}

export function updateProfile(data: Partial<UserProfile>) {
  return http.put('/api/users/profile', data)
}
