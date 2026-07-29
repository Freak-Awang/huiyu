/**
 * 文件与媒体上传 API：封装普通文件/图片上传、分片上传任务管理、头像上传及文件下载等接口。
 * 支持直传与分片两种模式，提供上传进度回调与中断能力。
 */
import http from './index'
import { toServerUrl } from '../config/runtime'
import type { AxiosProgressEvent } from 'axios'

/** 直传模式最大文件大小：100MB */
export const DIRECT_UPLOAD_MAX_SIZE = 100 * 1024 * 1024
/** 分片上传模式最大文件大小：2GB */
export const FILE_UPLOAD_MAX_SIZE = 2 * 1024 * 1024 * 1024

/**
 * 文件信息视图对象。
 */
export interface FileVO {
  /** 文件唯一标识 */
  id: string
  /** 原始文件名 */
  originalName?: string
  /** 文件大小（字节） */
  size?: number
  /** 格式化后的文件大小展示文本 */
  displaySize?: string
  /** 文件 MIME 类型 */
  contentType?: string
  /** 文件 SHA-256 哈希值 */
  sha256?: string
  /** 文件状态 */
  status?: string
  /** 文件过期时间 */
  expiresAt?: string
  /** 文件下载地址 */
  downloadUrl?: string
  /** 传输模式（直传或分片） */
  transferMode?: string
  /** 所属会话 ID */
  conversationId?: string
  /** 上传者 ID */
  uploaderId?: string
  /** 上传者昵称 */
  uploaderName?: string
  /** 上传时间 */
  createdAt?: string
  /** 下载次数 */
  downloadCount?: number
  /** 文件访问 URL */
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

/**
 * 分片上传任务信息。
 */
export interface FileUploadTask {
  /** 上传任务 ID */
  uploadId?: string
  /** 文件是否已存在（秒传） */
  fileExists: boolean
  /** 文件 ID */
  fileId?: string
  /** 分片大小（字节） */
  chunkSize: number
  /** 总分片数 */
  chunkCount: number
  /** 上传模式：multipart 分片上传 / second_transfer 秒传 */
  uploadMode: 'multipart' | 'second_transfer' | string
  /** 存储类型 */
  storageType?: string
  /** 任务状态 */
  status?: 'UPLOADING' | 'COMPLETED' | 'ABORTED' | string
  /** 任务过期时间 */
  expiresAt?: string
  /** 已上传的分片编号列表 */
  uploadedParts: number[]
  /** 关联的文件信息 */
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

/**
 * 直传文件（适用于小于 100MB 的文件或图片）。
 * 调用 POST /api/files/upload
 * @param file 待上传文件
 * @param conversationId 所属会话 ID（可选）
 * @param category 文件分类：file 普通文件 / image 图片
 * @param onProgress 上传进度回调（0~1）
 * @param signal 中断信号
 * @returns 上传成功的文件信息
 */
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

/**
 * 创建分片上传任务。
 * 调用 POST /api/files/upload/tasks
 * @param file 待上传文件
 * @param conversationId 所属会话 ID
 * @param sha256 文件 SHA-256 哈希值
 * @returns 创建的上传任务信息
 */
export function createUploadTask(file: File, conversationId: string, sha256: string) {
  return http.post<RawFileUploadTask>('/api/files/upload/tasks', {
    fileName: file.name || 'file',
    fileSize: file.size,
    contentType: file.type || 'application/octet-stream',
    sha256,
    conversationId,
  }).then((res) => ({ ...res, data: normalizeUploadTask(res.data) }))
}

/**
 * 查询分片上传任务状态。
 * 调用 GET /api/files/upload/tasks/:uploadId/parts
 * @param uploadId 上传任务 ID
 * @returns 任务当前状态与已上传分片信息
 */
export function getUploadTask(uploadId: string) {
  return http.get<RawFileUploadTask>(`/api/files/upload/tasks/${uploadId}/parts`)
    .then((res) => ({ ...res, data: normalizeUploadTask(res.data) }))
}

/**
 * 上传单个分片。
 * 调用 POST /api/files/upload/tasks/:uploadId/parts/:partNumber
 * @param uploadId 上传任务 ID
 * @param partNumber 分片编号（从 1 开始）
 * @param blob 分片数据
 * @param signal 中断信号
 * @param onProgress 分片上传进度回调
 * @returns 更新后的任务信息
 */
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

/**
 * 完成分片上传任务，合并所有分片。
 * 调用 POST /api/files/upload/tasks/:uploadId/complete
 * @param uploadId 上传任务 ID
 * @param sha256 文件 SHA-256 哈希值（用于校验）
 * @returns 合并后的文件信息
 */
export function completeUploadTask(uploadId: string, sha256: string) {
  return http.post<RawFileVO>(`/api/files/upload/tasks/${uploadId}/complete`, { sha256 })
    .then((res) => ({ ...res, data: normalizeFileVO(res.data) }))
}

/**
 * 取消分片上传任务。
 * 调用 DELETE /api/files/upload/tasks/:uploadId
 * @param uploadId 上传任务 ID
 * @returns 取消结果
 */
export function cancelUploadTask(uploadId: string) {
  return http.delete(`/api/files/upload/tasks/${uploadId}`)
}

/**
 * 上传用户头像。
 * 调用 POST /api/files/upload/avatar
 * @param file 头像图片文件
 * @returns 上传成功的文件信息
 */
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

/**
 * 获取文件下载/访问 URL。
 * @param fileId 文件 ID
 * @returns 完整文件访问地址
 */
export function getFileUrl(fileId: string) {
  return apiAssetUrl(`/api/files/download/${fileId}`)
}

/**
 * 下载文件为 Blob 对象。
 * 调用 GET /api/files/download/:fileId
 * @param fileId 文件 ID
 * @returns 文件 Blob 数据
 */
export function downloadFileBlob(fileId: string) {
  return http.get<Blob>(`/api/files/download/${fileId}`, { responseType: 'blob' })
}
