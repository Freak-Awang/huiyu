import http from './index'
import { toServerUrl } from '../config/runtime'

export const SMALL_FILE_MAX_SIZE = 100 * 1024 * 1024
export const LARGE_FILE_MAX_SIZE = 50 * 1024 * 1024 * 1024
const DEFAULT_CHUNK_SIZE = 64 * 1024 * 1024
const HASH_IN_MEMORY_LIMIT = 512 * 1024 * 1024

export interface UploadedFile {
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

interface RawUploadedFile {
  id?: string | number
  fileId?: string | number
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
  url?: string
}

export interface FilePage {
  records: UploadedFile[]
  total: number
  page: number
  pageSize: number
}

export interface FileTransfer {
  transferId: string
  mode: string
  status: string
  fileId?: string | number
  fileName: string
  fileSize: number
  contentType?: string
  sha256?: string
  expiresAt?: string
  fallbackReason?: string
  receiverOnline?: boolean
}

export interface FileUploadStatus {
  uploadId: string
  transferId?: string
  chunkSize: number
  totalParts: number
  uploadedParts: number[]
  status: string
  instant?: boolean
  file?: UploadedFile
}

export interface LargeUploadProgress {
  loaded: number
  total: number
  percent: number
  speed: number
  remainingSeconds: number
  status: 'hashing' | 'starting' | 'uploading' | 'completed'
}

export interface LargeUploadOptions {
  conversationId: string
  transfer?: FileTransfer
  onProgress?: (progress: LargeUploadProgress) => void
  signal?: AbortSignal
}

function apiAssetUrl(path: string) {
  return toServerUrl(path)
}

function normalizeUploadedFile(raw: RawUploadedFile): UploadedFile {
  const id = String(raw.id ?? raw.fileId ?? '')
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
    url: apiAssetUrl(raw.url || `/api/files/download/${id}`),
  }
}

function normalizeUploadStatus(raw: any): FileUploadStatus {
  return {
    uploadId: raw.uploadId || '',
    transferId: raw.transferId,
    chunkSize: Number(raw.chunkSize || DEFAULT_CHUNK_SIZE),
    totalParts: Number(raw.totalParts || 0),
    uploadedParts: Array.isArray(raw.uploadedParts) ? raw.uploadedParts.map(Number) : [],
    status: raw.status || '',
    instant: !!raw.instant,
    file: raw.file ? normalizeUploadedFile(raw.file) : undefined,
  }
}

export function uploadFile(file: File, conversationId?: string) {
  const formData = new FormData()
  formData.append('file', file)
  if (conversationId) formData.append('conversationId', conversationId)
  return http.post('/api/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 10 * 60 * 1000,
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
    timeout: 10 * 60 * 1000,
  }).then((res) => ({
    ...res,
    data: normalizeUploadedFile(res.data),
  }))
}

export function initFileTransfer(params: {
  conversationId: string
  receiverId?: string
  fileName: string
  fileSize: number
  contentType?: string
  sha256?: string
  mode?: string
  preferredMode?: 'AUTO' | 'SERVER' | 'P2P'
  archiveRequired?: boolean
}) {
  return http.post<FileTransfer>('/api/files/transfer/init', {
    conversationId: params.conversationId,
    receiverId: params.receiverId ? Number(params.receiverId) : undefined,
    fileName: params.fileName,
    fileSize: params.fileSize,
    contentType: params.contentType,
    sha256: params.sha256,
    mode: params.mode,
    preferredMode: params.preferredMode || params.mode || 'AUTO',
    archiveRequired: !!params.archiveRequired,
  })
}

export function updateFileTransferStatus(
  transferId: string,
  params: { status?: string; fallbackReason?: string },
) {
  return http.post<FileTransfer>(`/api/files/transfer/${transferId}/status`, params)
}

export function fallbackFileTransfer(transferId: string, fallbackReason?: string) {
  return http.post<FileTransfer>(`/api/files/transfer/${transferId}/fallback`, { fallbackReason })
}

export function initChunkedUpload(params: {
  conversationId: string
  transferId?: string
  fileName: string
  fileSize: number
  contentType?: string
  sha256?: string
}) {
  return http.post('/api/files/uploads/init', {
    conversationId: params.conversationId,
    transferId: params.transferId,
    fileName: params.fileName,
    fileSize: params.fileSize,
    contentType: params.contentType,
    sha256: params.sha256,
  }).then((res) => ({ ...res, data: normalizeUploadStatus(res.data) }))
}

export function getChunkedUploadStatus(uploadId: string) {
  return http.get(`/api/files/uploads/${uploadId}`).then((res) => ({
    ...res,
    data: normalizeUploadStatus(res.data),
  }))
}

export function uploadChunk(uploadId: string, partNumber: number, chunk: Blob) {
  const formData = new FormData()
  formData.append('file', chunk, `part-${partNumber}`)
  return http.post(`/api/files/uploads/${uploadId}/chunks/${partNumber}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 20 * 60 * 1000,
  }).then((res) => ({ ...res, data: normalizeUploadStatus(res.data) }))
}

export function completeChunkedUpload(uploadId: string, sha256?: string) {
  return http.post(`/api/files/uploads/${uploadId}/complete`, { sha256 }).then((res) => ({
    ...res,
    data: normalizeUploadedFile(res.data),
  }))
}

export function abortChunkedUpload(uploadId: string) {
  return http.post(`/api/files/uploads/${uploadId}/abort`)
}

export async function uploadLargeFile(file: File, options: LargeUploadOptions): Promise<UploadedFile> {
  if (file.size > LARGE_FILE_MAX_SIZE) {
    throw new Error('文件超过 50GB 上限')
  }

  options.onProgress?.(progressSnapshot('hashing', 0, file.size, Date.now()))
  const sha256 = await calculateFileSha256IfReasonable(file)
  assertNotAborted(options.signal)

  options.onProgress?.(progressSnapshot('starting', 0, file.size, Date.now()))
  const resumeKey = buildResumeKey(file, options.conversationId)
  const resumed = await loadUploadResume(resumeKey)
  let uploadStatus: FileUploadStatus | null = null
  if (resumed?.uploadId) {
    try {
      uploadStatus = (await getChunkedUploadStatus(resumed.uploadId)).data
    } catch {
      await deleteUploadResume(resumeKey)
    }
  }

  if (!uploadStatus) {
    const transfer = options.transfer || (await initFileTransfer({
      conversationId: options.conversationId,
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type,
      sha256,
      preferredMode: 'SERVER',
    })).data
    uploadStatus = (await initChunkedUpload({
      conversationId: options.conversationId,
      transferId: transfer.transferId,
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type,
      sha256,
    })).data
  }

  if (uploadStatus.instant && uploadStatus.file) {
    await deleteUploadResume(resumeKey)
    options.onProgress?.(progressSnapshot('completed', file.size, file.size, Date.now()))
    return uploadStatus.file
  }

  const uploadId = uploadStatus.uploadId
  const chunkSize = uploadStatus.chunkSize || DEFAULT_CHUNK_SIZE
  const uploadedParts = new Set(uploadStatus.uploadedParts || [])
  await saveUploadResume(resumeKey, {
    uploadId,
    fileName: file.name,
    fileSize: file.size,
    lastModified: file.lastModified,
    conversationId: options.conversationId,
    sha256,
    chunkSize,
    uploadedParts: [...uploadedParts],
    updatedAt: Date.now(),
  })
  const startedAt = Date.now()
  let loaded = 0
  for (const partNumber of uploadedParts) {
    const partStart = (partNumber - 1) * chunkSize
    loaded += Math.min(chunkSize, file.size - partStart)
  }

  const totalParts = Math.ceil(file.size / chunkSize)
  for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
    assertNotAborted(options.signal)
    if (uploadedParts.has(partNumber)) continue

    const start = (partNumber - 1) * chunkSize
    const end = Math.min(file.size, start + chunkSize)
    await uploadChunk(uploadId, partNumber, file.slice(start, end))
    loaded += end - start
    uploadedParts.add(partNumber)
    await saveUploadResume(resumeKey, {
      uploadId,
      fileName: file.name,
      fileSize: file.size,
      lastModified: file.lastModified,
      conversationId: options.conversationId,
      sha256,
      chunkSize,
      uploadedParts: [...uploadedParts],
      updatedAt: Date.now(),
    })
    options.onProgress?.(progressSnapshot('uploading', loaded, file.size, startedAt))
  }

  const completeRes = await completeChunkedUpload(uploadId, sha256)
  await deleteUploadResume(resumeKey)
  options.onProgress?.(progressSnapshot('completed', file.size, file.size, startedAt))
  return completeRes.data
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Upload aborted', 'AbortError')
  }
}

export function getFileUrl(fileId: string) {
  return apiAssetUrl(`/api/files/download/${fileId}`)
}

export function acknowledgeFileDownload(fileId: string) {
  return http.post(`/api/files/ack/${fileId}`)
}

export function listConversationFiles(params: {
  conversationId: string
  type?: 'all' | 'image' | 'file'
  keyword?: string
  page?: number
  pageSize?: number
}) {
  return http.get<any>(`/api/conversations/${params.conversationId}/files`, {
    params: {
      type: params.type || 'all',
      keyword: params.keyword || undefined,
      page: params.page || 1,
      pageSize: params.pageSize || 20,
    },
  }).then((res) => {
    const page = res.data || {}
    const records = Array.isArray(page) ? page : page.records || page.list || page.data || []
    return {
      ...res,
      data: {
        records: records.map(normalizeUploadedFile),
        total: Number(page.total || 0),
        page: Number(page.page || params.page || 1),
        pageSize: Number(page.pageSize || params.pageSize || 20),
      } as FilePage,
    }
  })
}

async function calculateFileSha256IfReasonable(file: File): Promise<string | undefined> {
  if (!window.crypto?.subtle || file.size > HASH_IN_MEMORY_LIMIT) {
    return undefined
  }
  const digest = await window.crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function progressSnapshot(
  status: LargeUploadProgress['status'],
  loaded: number,
  total: number,
  startedAt: number,
): LargeUploadProgress {
  const elapsedSeconds = Math.max(0.001, (Date.now() - startedAt) / 1000)
  const speed = loaded / elapsedSeconds
  const remainingSeconds = speed > 0 ? Math.max(0, (total - loaded) / speed) : 0
  return {
    loaded,
    total,
    percent: total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0,
    speed,
    remainingSeconds,
    status,
  }
}

interface UploadResumeRecord {
  uploadId: string
  fileName: string
  fileSize: number
  lastModified: number
  conversationId: string
  sha256?: string
  chunkSize: number
  uploadedParts: number[]
  updatedAt: number
}

const RESUME_DB_NAME = 'im-file-upload-resume'
const RESUME_STORE = 'uploads'

function buildResumeKey(file: File, conversationId: string) {
  return `${conversationId}:${file.name}:${file.size}:${file.lastModified}`
}

function openResumeDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RESUME_DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(RESUME_STORE)) {
        db.createObjectStore(RESUME_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function loadUploadResume(key: string): Promise<UploadResumeRecord | null> {
  if (!('indexedDB' in window)) return null
  const db = await openResumeDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RESUME_STORE, 'readonly')
    const request = tx.objectStore(RESUME_STORE).get(key)
    request.onsuccess = () => resolve((request.result as UploadResumeRecord) || null)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

async function saveUploadResume(key: string, value: UploadResumeRecord) {
  if (!('indexedDB' in window)) return
  const db = await openResumeDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(RESUME_STORE, 'readwrite')
    tx.objectStore(RESUME_STORE).put(value, key)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}

async function deleteUploadResume(key: string) {
  if (!('indexedDB' in window)) return
  const db = await openResumeDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(RESUME_STORE, 'readwrite')
    tx.objectStore(RESUME_STORE).delete(key)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error)
  })
}
