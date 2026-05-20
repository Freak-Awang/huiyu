import http from './index'

export function uploadFile(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return http.post('/api/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function uploadAvatar(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return http.post('/api/files/upload/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function getFileUrl(fileId: string) {
  return `/api/files/download/${fileId}`
}
