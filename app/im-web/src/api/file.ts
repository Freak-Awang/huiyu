/**
 * 服务器媒体 API。普通 FILE/FOLDER 附件只通过 P2P 传输；这里仅保留
 * 聊天图片和头像所需的上传与读取能力。
 */
import http from './index'
import { toServerUrl } from '../config/runtime'

/** 聊天图片直传上限：100MB。 */
export const DIRECT_UPLOAD_MAX_SIZE = 100 * 1024 * 1024

export interface FileVO {
  id: string
  originalName?: string
  size?: number
  displaySize?: string
  contentType?: string
  sha256?: string
  status?: string
  expiresAt?: string
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
  conversationId?: number | string
  uploaderId?: number | string
  uploaderName?: string
  createdAt?: string
  downloadCount?: number
  downloadUrl?: string
  url?: string
}

function mediaUrl(path: string) {
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
    conversationId: raw.conversationId != null ? String(raw.conversationId) : undefined,
    uploaderId: raw.uploaderId != null ? String(raw.uploaderId) : undefined,
    uploaderName: raw.uploaderName,
    createdAt: raw.createdAt,
    downloadCount: raw.downloadCount,
    url: mediaUrl(raw.url || raw.downloadUrl || `/api/files/download/${id}`),
  }
}

/** 上传会话图片。该接口不接受普通文件附件。 */
export function uploadConversationImage(
  file: File,
  conversationId: string,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('conversationId', conversationId)
  return http.post('/api/files/upload/image', formData, {
    timeout: 10 * 60 * 1000,
    signal,
    onUploadProgress: (event) => onProgress?.(event.total ? event.loaded / event.total : 0),
  }).then((res) => ({ ...res, data: normalizeFileVO(res.data) }))
}

/** 上传用户头像。 */
export function uploadAvatar(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return http.post('/api/files/upload/avatar', formData, { timeout: 10 * 60 * 1000 })
    .then((res) => ({ ...res, data: normalizeFileVO(res.data) }))
}

/** 获取图片或头像资源 URL。 */
export function getFileUrl(fileId: string) {
  return mediaUrl(`/api/files/download/${fileId}`)
}

/** 读取需要认证的图片或头像。 */
export function downloadFileBlob(fileId: string) {
  return http.get<Blob>(`/api/files/download/${fileId}`, { responseType: 'blob' })
}
