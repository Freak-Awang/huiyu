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
  sourceCommit: string
  manifestName: string
  manifestDigest: string
  signerThumbprint: string
  artifactVerifiedAt?: string
  status: ReleaseStatus
  publishedAt?: string
  createTime?: string
}

export interface TargetRule {
  targetType: 'DEVICE' | 'USER' | 'DEPT'
  targetValue: string
  mode: 'ALLOW' | 'DENY'
}

export interface ReleasePolicyPayload {
  releaseName: string
  releaseNotes: string[]
  minimumVersion?: string
  forceUpdate: boolean
  rolloutPercentage: number
  targets: TargetRule[]
  reason: string
  confirmationVersion?: string
}

export interface ReleaseActionPayload {
  reason: string
  confirmationVersion?: string
}

export function getReleasePage(params: { channel?: string; status?: string; page: number; pageSize: number }) {
  return client.get('/api/admin/client-releases', { params })
}

export function getRelease(id: number) {
  return client.get(`/api/admin/client-releases/${id}`)
}

export function updateReleasePolicy(id: number, payload: ReleasePolicyPayload) {
  return client.patch(`/api/admin/client-releases/${id}/policy`, payload)
}

export function publishRelease(id: number, payload: ReleaseActionPayload) {
  return client.post(`/api/admin/client-releases/${id}/publish`, payload)
}

export function pauseRelease(id: number, payload: ReleaseActionPayload) {
  return client.post(`/api/admin/client-releases/${id}/pause`, payload)
}

export function getReleaseStatistics(id: number) {
  return client.get(`/api/admin/client-releases/${id}/statistics`)
}
