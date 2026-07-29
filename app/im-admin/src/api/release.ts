/**
 * 客户端版本发布管理 API
 * 封装版本分页查询、详情、保存、发布、暂停及统计接口。
 */
import client from './index'

/** 版本状态：草稿 / 已发布 / 已暂停 / 已被替代 */
export type ReleaseStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'REPLACED'

/** 客户端版本信息 */
export interface ClientRelease {
  id: number
  version: string
  channel: 'stable' | 'beta'
  platform: string
  arch: string
  releaseName: string
  releaseNotes?: string
  minimumVersion?: string
  forceUpdate: boolean
  rolloutPercentage: number
  updateBaseUrl: string
  installerName: string
  installerSize?: number
  installerSha512: string
  status: ReleaseStatus
  publishedAt?: string
  createTime?: string
}

/** 定向规则（白名单/黑名单） */
export interface TargetRule {
  targetType: 'DEVICE' | 'USER' | 'DEPT'
  targetValue: string
  mode: 'ALLOW' | 'DENY'
}

/** 保存版本时的请求体 */
export interface ReleasePayload extends Omit<ClientRelease, 'id' | 'status' | 'publishedAt' | 'createTime' | 'releaseNotes'> {
  id?: number
  releaseNotes: string[]
  targets: TargetRule[]
}

/**
 * 分页查询版本列表
 * GET /api/admin/client-releases
 */
export function getReleasePage(params: { channel?: string; status?: string; page: number; pageSize: number }) {
  return client.get('/api/admin/client-releases', { params })
}

/**
 * 获取版本详情
 * GET /api/admin/client-releases/{id}
 */
export function getRelease(id: number) {
  return client.get(`/api/admin/client-releases/${id}`)
}

/**
 * 保存版本（新增或更新）
 * POST /api/admin/client-releases 或 PUT /api/admin/client-releases/{id}
 */
export function saveRelease(payload: ReleasePayload) {
  return payload.id
    ? client.put(`/api/admin/client-releases/${payload.id}`, payload)
    : client.post('/api/admin/client-releases', payload)
}

/**
 * 发布版本
 * POST /api/admin/client-releases/{id}/publish
 */
export function publishRelease(id: number) {
  return client.post(`/api/admin/client-releases/${id}/publish`)
}

/**
 * 暂停版本
 * POST /api/admin/client-releases/{id}/pause
 */
export function pauseRelease(id: number) {
  return client.post(`/api/admin/client-releases/${id}/pause`)
}

/**
 * 获取版本更新统计
 * GET /api/admin/client-releases/{id}/statistics
 */
export function getReleaseStatistics(id: number) {
  return client.get(`/api/admin/client-releases/${id}/statistics`)
}

