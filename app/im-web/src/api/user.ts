/**
 * 用户信息 API：封装当前用户资料查询、指定用户查询、部门用户列表、用户搜索、
 * 密码修改与资料更新等接口，并提供用户数据规范化转换。
 */
import http from './index'
import { toServerUrl } from '../config/runtime'

/**
 * 用户资料信息。
 */
export interface UserProfile {
  /** 用户唯一标识 */
  userId: string
  /** 登录用户名 */
  username: string
  /** 用户昵称 */
  nickname: string
  /** 头像 URL */
  avatar: string
  /** 个性签名 */
  signature: string
  /** 邮箱 */
  email: string
  /** 手机号 */
  phone: string
  /** 所属部门 ID */
  deptId: string
  /** 所属部门名称 */
  deptName: string
  /** 用户角色 */
  role: string
  /** 备注 */
  remark: string
  /** 账号状态 */
  status: string | number
  /** 创建时间 */
  createdAt?: string
  /** 最后更新时间 */
  updatedAt: string
}

/**
 * 获取当前登录用户资料。
 * 调用 GET /api/users/me
 * @returns 规范化后的用户资料
 */
export function getProfile() {
  return http.get<UserProfile>('/api/users/me').then((res) => ({
    ...res,
    data: normalizeUserProfile(res.data),
  }))
}

/**
 * 获取指定用户资料。
 * 调用 GET /api/users/:userId
 * @param userId 目标用户 ID
 * @returns 规范化后的用户资料
 */
export function getUserProfile(userId: string | number) {
  return http.get<UserProfile>(`/api/users/${userId}`).then((res) => ({
    ...res,
    data: normalizeUserProfile(res.data),
  }))
}

/**
 * 获取部门用户列表。
 * 调用 GET /api/users/list
 * @param deptId 部门 ID（可选，为空则查询全部）
 * @returns 规范化后的用户列表
 */
export function getUsersByDept(deptId?: string) {
  return http.get('/api/users/list', { params: { deptId } }).then((res) => ({
    ...res,
    data: normalizeUsers(res.data),
  }))
}

/**
 * 规范化用户基础字段：统一 ID 类型、补全头像 URL、兼容时间字段命名。
 * @param user 原始用户数据
 * @returns 规范化后的用户数据
 */
export function normalizeUser<T extends Record<string, any>>(user: T): T {
  return {
    ...user,
    userId: String(user.userId ?? user.id ?? ''),
    deptId: user.deptId == null ? '' : String(user.deptId),
    avatar: user.avatar ? toServerUrl(user.avatar) : '',
    updatedAt: user.updatedAt || user.updateTime || '',
  }
}

/**
 * 将原始用户数据规范化为标准 UserProfile 类型。
 * @param user 原始用户数据
 * @returns 规范化后的 UserProfile 对象
 */
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

/**
 * 搜索用户。
 * 调用 GET /api/users/search
 * @param keyword 搜索关键词
 * @param page 页码
 * @param pageSize 每页数量
 * @returns 匹配的用户列表
 */
export function searchUsers(keyword: string, page: number, pageSize: number) {
  return http.get('/api/users/search', { params: { keyword, page, pageSize } }).then((res) => ({
    ...res,
    data: normalizeUsers(res.data),
  }))
}

/**
 * 修改当前用户密码。
 * 调用 PUT /api/users/password
 * @param oldPassword 原密码
 * @param newPassword 新密码
 * @returns 修改结果
 */
export function updatePassword(oldPassword: string, newPassword: string) {
  return http.put('/api/users/password', { oldPassword, newPassword })
}

/**
 * 更新当前用户资料。
 * 调用 PUT /api/users/profile
 * @param data 待更新的资料字段
 * @returns 更新后的用户资料
 */
export function updateProfile(data: Partial<UserProfile>) {
  return http.put<UserProfile>('/api/users/profile', data).then((res) => ({
    ...res,
    data: normalizeUserProfile(res.data),
  }))
}
