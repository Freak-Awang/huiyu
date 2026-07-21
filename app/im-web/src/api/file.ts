// Intent: file wraps the media upload API used by images and avatars.
import http from './index'
import { toServerUrl } from '../config/runtime'
import type { AxiosProgressEvent } from 'axios'

export const DIRECT_UPLOAD_MAX_SIZE = 100 * 1024 * 1024
export const FILE_UPLOAD_MAX_SIZE = 50 * 1024 * 1024 * 1024

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

export interface FileUploadTask {
  uploadId?: string
  fileExists: boolean
  fileId?: string
  chunkSize: number
  chunkCount: number
  uploadMode: 'multipart' | 'second_transfer' | string
  storageType?: string
  status?: 'UPLOADING' | 'COMPLETED' | 'ABORTED' | string
  expiresAt?: string
  uploadedParts: number[]
  file?: FileVO
}

interface RawFileUploadTask extends Omit<FileUploadTask, 'fileId' | 'file'> {
  fileId?: string | number
  file?: RawFileVO
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

export function uploadFile(
  file: File,
  conversationId?: string,
  category: 'file' | 'image' = 'file',
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
) {
  const formData = new FormData()
  formData.append('file', file)
  if (conversationId) formData.append('conversationId', conversationId)
  formData.append('category', category)
  return http.post('/api/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 10 * 60 * 1000,
    signal,
    onUploadProgress: (event) => onProgress?.(event.total ? event.loaded / event.total : 0),
  }).then((res) => ({
    ...res,
    data: normalizeFileVO(res.data),
  }))
}

function normalizeUploadTask(raw: RawFileUploadTask): FileUploadTask {
  return {
    ...raw,
    fileId: raw.fileId != null ? String(raw.fileId) : undefined,
    chunkSize: Number(raw.chunkSize || 0),
    chunkCount: Number(raw.chunkCount || 0),
    uploadedParts: Array.isArray(raw.uploadedParts) ? raw.uploadedParts.map(Number) : [],
    file: raw.file ? normalizeFileVO(raw.file) : undefined,
  }
}

export function createUploadTask(file: File, conversationId: string, sha256: string) {
  return http.post<RawFileUploadTask>('/api/files/upload/tasks', {
    fileName: file.name || 'file',
    fileSize: file.size,
    contentType: file.type || 'application/octet-stream',
    sha256,
    conversationId,
  }).then((res) => ({ ...res, data: normalizeUploadTask(res.data) }))
}

export function getUploadTask(uploadId: string) {
  return http.get<RawFileUploadTask>(`/api/files/upload/tasks/${uploadId}/parts`)
    .then((res) => ({ ...res, data: normalizeUploadTask(res.data) }))
}

export function uploadFilePart(
  uploadId: string,
  partNumber: number,
  blob: Blob,
  signal?: AbortSignal,
  onProgress?: (event: AxiosProgressEvent) => void,
) {
  const formData = new FormData()
  formData.append('file', blob, `part-${partNumber}`)
  return http.post<RawFileUploadTask>(`/api/files/upload/tasks/${uploadId}/parts/${partNumber}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 10 * 60 * 1000,
    signal,
    onUploadProgress: onProgress,
  }).then((res) => ({ ...res, data: normalizeUploadTask(res.data) }))
}

export function completeUploadTask(uploadId: string, sha256: string) {
  return http.post<RawFileVO>(`/api/files/upload/tasks/${uploadId}/complete`, { sha256 })
    .then((res) => ({ ...res, data: normalizeFileVO(res.data) }))
}

export function cancelUploadTask(uploadId: string) {
  return http.delete(`/api/files/upload/tasks/${uploadId}`)
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

export function downloadFileBlob(fileId: string) {
  return http.get<Blob>(`/api/files/download/${fileId}`, { responseType: 'blob' })
}
