import http from './index'
import { toServerUrl } from '../config/runtime'

export interface UploadedFile {
  id: string
  originalName?: string
  url: string
}

interface RawUploadedFile {
  id?: string | number
  fileId?: string | number
  originalName?: string
  url?: string
}

function apiAssetUrl(path: string) {
  return toServerUrl(path)
}

function normalizeUploadedFile(raw: RawUploadedFile): UploadedFile {
  const id = String(raw.id ?? raw.fileId ?? '')
  return {
    id,
    originalName: raw.originalName,
    url: apiAssetUrl(raw.url || `/api/files/download/${id}`),
  }
}

export function uploadFile(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return http.post('/api/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((res) => ({
    ...res,
    data: normalizeUploadedFile(res.data),
  }))
}

export function uploadAvatar(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return http.post('/api/files/upload/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((res) => ({
    ...res,
    data: normalizeUploadedFile(res.data),
  }))
}

export function getFileUrl(fileId: string) {
  return apiAssetUrl(`/api/files/download/${fileId}`)
}

export function acknowledgeFileDownload(fileId: string) {
  return http.post(`/api/files/ack/${fileId}`)
}
