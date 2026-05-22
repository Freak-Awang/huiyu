import http from './index'

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
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  const normalized = path.startsWith('/') ? path : `/${path}`
  return import.meta.env.PROD ? normalized : `http://localhost:8080${normalized}`
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
