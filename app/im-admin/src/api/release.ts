import client from './index'

export type ReleaseStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'REPLACED'

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

export interface TargetRule {
  targetType: 'DEVICE' | 'USER' | 'DEPT'
  targetValue: string
  mode: 'ALLOW' | 'DENY'
}

export interface ReleasePayload extends Omit<ClientRelease, 'id' | 'status' | 'publishedAt' | 'createTime' | 'releaseNotes'> {
  id?: number
  releaseNotes: string[]
  targets: TargetRule[]
}

export function getReleasePage(params: { channel?: string; status?: string; page: number; pageSize: number }) {
  return client.get('/api/admin/client-releases', { params })
}

export function getRelease(id: number) {
  return client.get(`/api/admin/client-releases/${id}`)
}

export function saveRelease(payload: ReleasePayload) {
  return payload.id
    ? client.put(`/api/admin/client-releases/${payload.id}`, payload)
    : client.post('/api/admin/client-releases', payload)
}

export function publishRelease(id: number) {
  return client.post(`/api/admin/client-releases/${id}/publish`)
}

export function pauseRelease(id: number) {
  return client.post(`/api/admin/client-releases/${id}/pause`)
}

export function getReleaseStatistics(id: number) {
  return client.get(`/api/admin/client-releases/${id}/statistics`)
}

