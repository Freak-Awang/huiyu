/**
 * 会话管理 API：封装会话的增删改查、成员管理、置顶/免打扰、群头像与群主转让等接口。
 * 同时提供后端原始数据到前端标准 Conversation 类型的规范化转换。
 */
import http from './index'
import { toServerUrl } from '../config/runtime'
import type { AxiosProgressEvent } from 'axios'

/**
 * 会话（聊天）实体：表示一个单聊或群聊会话。
 */
export interface Conversation {
  /** 会话唯一标识 */
  conversationId: string
  /** 会话类型：单聊或群聊 */
  type: 'SINGLE' | 'GROUP'
  /** 会话名称（群聊为群名，单聊为对方昵称） */
  name: string
  /** 会话头像 URL */
  avatar: string
  /** 头像类型：默认或自定义 */
  avatarType: 'default' | 'custom' | null
  /** 头像最后修改人 ID */
  avatarUpdatedBy?: string
  /** 头像最后修改时间 */
  avatarUpdatedAt?: string
  /** 群主 ID */
  ownerId?: string
  /** 当前用户是否有权限编辑群头像 */
  canEditAvatar: boolean
  /** 最后一条消息预览 */
  lastMessage: MessagePreview | null
  /** 群公告内容 */
  announcement?: string
  /** 公告最后修改人 ID */
  announcementUpdatedBy?: string
  /** 公告最后修改时间 */
  announcementUpdatedAt?: string
  /** 会话成员列表 */
  members?: ConversationMember[]
  /** 成员数量 */
  memberCount: number
  /** 是否置顶 */
  pinned: boolean
  /** 创建时间 */
  createdAt: string
  /** 最后更新时间 */
  updatedAt: string
  /** 未读消息数 */
  unreadCount: number
  /** 未读 @ 消息数 */
  mentionUnreadCount: number
  /** 是否免打扰 */
  muted: boolean
}

/**
 * 会话成员信息。
 */
export interface ConversationMember {
  /** 成员用户 ID */
  userId: string
  /** 成员昵称 */
  nickname?: string
  /** 成员头像 URL */
  avatar?: string
  /** 成员个性签名 */
  signature?: string
  /** 成员角色（如 admin、member） */
  role?: string
}

/**
 * 最后一条消息预览，用于会话列表展示。
 */
export interface MessagePreview {
  /** 消息 ID */
  messageId: string
  /** 发送者 ID */
  senderId: string
  /** 发送者昵称 */
  senderName: string
  /** 消息内容（已格式化为展示文本） */
  content: string
  /** 消息类型 */
  messageType: string
  /** 发送时间 */
  createdAt: string
}

/**
 * 后端返回的原始会话数据结构，字段类型与命名可能不统一，需经 normalizeConversation 转换。
 */
export interface RawConversation {
  id?: number | string
  conversationId?: number | string
  type?: number | string
  name?: string | null
  avatar?: string | null
  avatarType?: string | null
  avatarUpdatedBy?: number | string | null
  avatarUpdatedAt?: string | null
  ownerId?: number | string | null
  canEditAvatar?: boolean | null
  lastMessage?: string | MessagePreview | null
  announcement?: string | null
  announcementUpdatedBy?: number | string | null
  announcementUpdatedAt?: string | null
  lastMessageTime?: string | null
  unreadCount?: number | null
  mentionUnreadCount?: number | null
  isPinned?: number | boolean | null
  isMuted?: number | boolean | null
  muted?: boolean | null
  pinned?: boolean | null
  memberCount?: number | null
  members?: Array<Omit<ConversationMember, 'userId'> & { userId: number | string }>
  createTime?: string | null
  updateTime?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

/**
 * 创建会话参数：单聊需指定目标用户；群聊携带自动生成的兼容群名、成员列表与幂等 requestId。
 * 新版服务端仍会按成员资料统一生成最终群名。
 */
export type CreateConversationParams =
  | { type: 'SINGLE'; targetUserId: string | number }
  | {
      type: 'GROUP'
      name: string
      requestId: string
      memberIds: Array<string | number>
    }

/**
 * 将后端原始会话数据规范化为前端统一的 Conversation 类型。
 * 处理字段命名差异、类型转换、头像 URL 补全及最后一条消息格式化。
 * @param raw 后端原始会话数据
 * @returns 规范化后的 Conversation 对象
 */
export function normalizeConversation(raw: RawConversation): Conversation {
  const conversationId = String(raw.conversationId ?? raw.id ?? '')
  const type = raw.type === 1 || raw.type === '1' || raw.type === 'SINGLE' ? 'SINGLE' : 'GROUP'
  const avatarType =
    type === 'GROUP'
      ? raw.avatarType === 'custom' && raw.avatar
        ? 'custom'
        : raw.avatar
          ? 'custom'
          : 'default'
      : null
  const lastMessageTime = raw.lastMessageTime || raw.updatedAt || raw.updateTime || raw.createdAt || raw.createTime || ''
  const rawLastMessage = raw.lastMessage
  const lastMessage =
    typeof rawLastMessage === 'string'
      ? {
          messageId: '',
          senderId: '',
          senderName: '',
          content: rawLastMessage,
          messageType: 'TEXT',
          createdAt: lastMessageTime,
        }
      : rawLastMessage || null

  const members =
    raw.members?.map((member) => ({
      ...member,
      userId: String(member.userId),
      avatar: member.avatar ? toServerUrl(member.avatar) : '',
    })) || []

  return {
    conversationId,
    type,
    name: raw.name || '',
    avatar: raw.avatar ? toServerUrl(raw.avatar) : '',
    avatarType,
    avatarUpdatedBy: raw.avatarUpdatedBy != null ? String(raw.avatarUpdatedBy) : undefined,
    avatarUpdatedAt: raw.avatarUpdatedAt || '',
    ownerId: raw.ownerId != null ? String(raw.ownerId) : undefined,
    canEditAvatar: Boolean(raw.canEditAvatar),
    announcement: raw.announcement || '',
    announcementUpdatedBy: raw.announcementUpdatedBy != null ? String(raw.announcementUpdatedBy) : undefined,
    announcementUpdatedAt: raw.announcementUpdatedAt || '',
    lastMessage,
    members,
    memberCount: raw.memberCount ?? members.length,
    pinned: Boolean(raw.pinned ?? raw.isPinned),
    createdAt: raw.createdAt || raw.createTime || '',
    updatedAt: raw.updatedAt || raw.updateTime || lastMessageTime || '',
    unreadCount: raw.unreadCount || 0,
    mentionUnreadCount: raw.mentionUnreadCount || 0,
    muted: Boolean(raw.muted ?? raw.isMuted),
  }
}

/**
 * 获取当前用户的会话列表。
 * 调用 GET /api/conversations
 * @returns 规范化后的会话数组
 */
export function listConversations() {
  return http.get<RawConversation[]>('/api/conversations').then((res) => ({
    ...res,
    data: (res.data || []).map(normalizeConversation),
  }))
}

/**
 * 获取指定会话详情。
 * 调用 GET /api/conversations/:conversationId
 * @param conversationId 会话 ID
 * @returns 规范化后的会话对象
 */
export function getConversation(conversationId: string) {
  return http.get<RawConversation>(`/api/conversations/${conversationId}`).then((res) => ({
    ...res,
    data: normalizeConversation(res.data),
  }))
}

/**
 * 创建新会话（单聊或群聊）。
 * 调用 POST /api/conversations
 * @param data 创建会话参数
 * @returns 创建成功的会话对象
 */
export function createConversation(data: CreateConversationParams) {
  const payload =
    data.type === 'SINGLE'
      ? { type: 1, targetUserId: Number(data.targetUserId) }
      : {
          type: 2,
          name: data.name,
          requestId: data.requestId,
          memberIds: data.memberIds.map((id) => Number(id)),
        }

  return http.post<RawConversation>('/api/conversations', payload).then((res) => ({
    ...res,
    data: normalizeConversation(res.data),
  }))
}

/**
 * 向群聊中添加成员。
 * 调用 POST /api/conversations/:convId/members
 * @param convId 会话 ID
 * @param userIds 待添加的用户 ID 列表
 * @returns 添加结果
 */
export function addMembers(convId: string, userIds: string[]) {
  return http.post(`/api/conversations/${convId}/members`, {
    userIds: userIds.map((id) => Number(id)),
  })
}

/**
 * 从群聊中移除成员。
 * 调用 DELETE /api/conversations/:convId/members/:userId
 * @param convId 会话 ID
 * @param userId 待移除的用户 ID
 * @returns 移除结果
 */
export function removeMember(convId: string, userId: string) {
  return http.delete(`/api/conversations/${convId}/members/${userId}`)
}

/**
 * 设置会话置顶状态。
 * 调用 PUT /api/conversations/:convId/pin
 * @param convId 会话 ID
 * @param pinned 是否置顶
 * @returns 设置结果
 */
export function pinConversation(convId: string, pinned: boolean) {
  return http.put(`/api/conversations/${convId}/pin`, null, { params: { pinned } })
}

/**
 * 设置会话免打扰状态。
 * 调用 PUT /api/conversations/:convId/mute
 * @param convId 会话 ID
 * @param muted 是否免打扰
 * @returns 设置结果
 */
export function muteConversation(convId: string, muted: boolean) {
  return http.put(`/api/conversations/${convId}/mute`, null, { params: { muted } })
}

/**
 * 更新会话设置（群名称或群公告）。
 * 调用 PUT /api/conversations/:convId/settings
 * @param convId 会话 ID
 * @param data 待更新的设置项
 * @returns 更新后的会话对象
 */
export function updateConversationSettings(
  convId: string,
  data: { name?: string; announcement?: string },
) {
  return http.put<RawConversation>(`/api/conversations/${convId}/settings`, data).then((res) => ({
    ...res,
    data: normalizeConversation(res.data),
  }))
}

/**
 * 更新群成员角色。
 * 调用 PUT /api/conversations/:convId/members/:userId/role
 * @param convId 会话 ID
 * @param userId 目标用户 ID
 * @param role 新角色（admin 或 member）
 * @returns 更新后的会话对象
 */
export function updateMemberRole(convId: string, userId: string, role: 'admin' | 'member') {
  return http.put<RawConversation>(`/api/conversations/${convId}/members/${userId}/role`, { role }).then((res) => ({
    ...res,
    data: normalizeConversation(res.data),
  }))
}

/**
 * 上传群头像。
 * 调用 POST /api/conversations/:convId/avatar
 * @param convId 会话 ID
 * @param file 头像图片文件
 * @param onProgress 上传进度回调（0~1）
 * @returns 更新后的会话对象
 */
export function uploadGroupAvatar(
  convId: string,
  file: File,
  onProgress?: (progress: number) => void,
) {
  const formData = new FormData()
  formData.append('file', file)
  return http.post<RawConversation>(`/api/conversations/${convId}/avatar`, formData, {
    timeout: 10 * 60 * 1000,
    onUploadProgress: (event: AxiosProgressEvent) =>
      onProgress?.(event.total ? event.loaded / event.total : 0),
  }).then((res) => ({
    ...res,
    data: normalizeConversation(res.data),
  }))
}

/**
 * 恢复群聊默认头像。
 * 调用 DELETE /api/conversations/:convId/avatar
 * @param convId 会话 ID
 * @returns 更新后的会话对象
 */
export function restoreDefaultGroupAvatar(convId: string) {
  return http.delete<RawConversation>(`/api/conversations/${convId}/avatar`).then((res) => ({
    ...res,
    data: normalizeConversation(res.data),
  }))
}

/**
 * 转让群主。
 * 调用 PUT /api/conversations/:convId/owner
 * @param convId 会话 ID
 * @param newOwnerId 新群主用户 ID
 * @returns 更新后的会话对象
 */
export function transferConversationOwner(convId: string, newOwnerId: string) {
  return http.put<RawConversation>(`/api/conversations/${convId}/owner`, {
    newOwnerId: Number(newOwnerId),
  }).then((res) => ({
    ...res,
    data: normalizeConversation(res.data),
  }))
}
