// Intent: file wraps the media upload API used by images and avatars.
import http from './index'
import { toServerUrl } from '../config/runtime'

export interface FileVO {
  id: string
  originalName?: string
  size?: number
  displaySize?: string
  contentType?: string
  sha256?: string
  status?: string
  expiresAt?: string
  downloadUrl?: string
  transferMode?: string
  conversationId?: string
  uploaderId?: string
  uploaderName?: string
  createdAt?: string
  downloadCount?: number
  url: string
}

interface RawFileVO {
  id?: string | number
  originalName?: string
  size?: number
  displaySize?: string
  contentType?: string
  sha256?: string
  status?: string
  expiresAt?: string
  downloadUrl?: string
  transferMode?: string
  conversationId?: number | string
  uploaderId?: number | string
  uploaderName?: string
  createdAt?: string
  downloadCount?: number
  url?: string
}

function apiAssetUrl(path: string) {
  return toServerUrl(path)
}

function normalizeFileVO(raw: RawFileVO): FileVO {
  const id = String(raw.id ?? '')
  return {
    id,
    originalName: raw.originalName,
    size: raw.size,
    displaySize: raw.displaySize,
    contentType: raw.contentType,
    sha256: raw.sha256,
    status: raw.status,
    expiresAt: raw.expiresAt,
    downloadUrl: apiAssetUrl(raw.downloadUrl || raw.url || `/api/files/download/${id}`),
    transferMode: raw.transferMode,
    conversationId: raw.conversationId != null ? String(raw.conversationId) : undefined,
    uploaderId: raw.uploaderId != null ? String(raw.uploaderId) : undefined,
    uploaderName: raw.uploaderName,
    createdAt: raw.createdAt,
    downloadCount: raw.downloadCount,
    url: apiAssetUrl(raw.url || `/api/files/download/${id}`),
  }
}

export function uploadFile(file: File, conversationId?: string, category: 'file' | 'image' = 'file') {
  const formData = new FormData()
  formData.append('file', file)
  if (conversationId) formData.append('conversationId', conversationId)
  formData.append('category', category)
  return http.post('/api/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 10 * 60 * 1000,
  }).then((res) => ({
    ...res,
    data: normalizeFileVO(res.data),
  }))
}

export function uploadAvatar(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return http.post('/api/files/upload/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 10 * 60 * 1000,
  }).then((res) => ({
    ...res,
    data: normalizeFileVO(res.data),
  }))
}

export function getFileUrl(fileId: string) {
  return apiAssetUrl(`/api/files/download/${fileId}`)
}
