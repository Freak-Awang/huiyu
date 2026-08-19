/**
 * 文件传输编排模块
 *
 * 统一管理文件上传全流程：哈希计算 -> 秒传检测 -> 分片上传 -> 断点续传。
 *
 * 上传策略：
 * - 小文件（<=100MB）：直接上传，无需哈希和分片
 * - 大文件（>100MB）：先计算 SHA-256 -> 请求服务端创建上传任务 ->
 *   服务端判断文件是否已存在（秒传） -> 不存在则分片上传 -> 完成后通知服务端合并
 *
 * 断点续传：
 * - 上传任务信息持久化到 localStorage，按 (userId + conversationId + fileName + fileSize + lastModified) 作为指纹
 * - 中断后重新上传时，先从 localStorage 恢复任务，查询服务端已上传分片，仅上传缺失分片
 *
 * 并发控制：最多 3 个分片并发上传，失败自动重试（最多 3 次，递增延迟）
 */
import {
  DIRECT_UPLOAD_MAX_SIZE,
  FILE_UPLOAD_MAX_SIZE,
  cancelUploadTask,
  completeUploadTask,
  createUploadTask,
  getUploadTask,
  uploadFile,
  uploadFilePart,
  type FileUploadTask,
  type FileVO,
} from '../api/file'
import { hashFile } from './fileHash'

const STORAGE_KEY = 'imUploadTasksV1'
const UPLOAD_CONCURRENCY = 3 // 分片并发上传数
const RETRY_DELAYS = [1000, 2000, 4000] // 重试递增延迟（毫秒）

/** 文件传输阶段 */
export type FileTransferStage = 'hashing' | 'uploading' | 'completed'

/** 文件传输进度信息 */
export interface FileTransferProgress {
  stage: FileTransferStage
  progress: number
  uploadedBytes: number
  totalBytes: number
}

/** 持久化的上传任务记录 */
interface PersistedUploadTask {
  fingerprint: string      // 任务唯一指纹
  userId: string
  conversationId: string
  fileName: string
  fileSize: number
  lastModified: number
  sha256: string           // 文件 SHA-256，用于秒传和完整性校验
  uploadId: string
  expiresAt?: string
}

interface UploadOptions {
  signal?: AbortSignal
  onProgress?: (progress: FileTransferProgress) => void
}

/** 生成上传任务指纹：用户+会话+文件名+大小+修改时间 */
function fingerprint(file: File, userId: string, conversationId: string) {
  return [userId, conversationId, file.name, file.size, file.lastModified].join(':')
}

function readTasks(): PersistedUploadTask[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function writeTasks(tasks: PersistedUploadTask[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks.slice(-50)))
}

function saveTask(task: PersistedUploadTask) {
  writeTasks([...readTasks().filter((item) => item.fingerprint !== task.fingerprint), task])
}

function removeTask(taskFingerprint: string) {
  writeTasks(readTasks().filter((item) => item.fingerprint !== taskFingerprint))
}

function findTask(taskFingerprint: string) {
  return readTasks().find((item) => item.fingerprint === taskFingerprint)
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('上传已暂停', 'AbortError')
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }
    const timer = globalThis.setTimeout(finish, ms)
    const abort = () => {
      globalThis.clearTimeout(timer)
      reject(new DOMException('上传已暂停', 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })
  })
}

/** 计算指定分片的大小（最后一个分片可能不满） */
function partSize(fileSize: number, chunkSize: number, partNumber: number) {
  const start = (partNumber - 1) * chunkSize
  return Math.max(0, Math.min(chunkSize, fileSize - start))
}

/** 判断上传任务是否已过期 */
function taskExpired(task: PersistedUploadTask | FileUploadTask) {
  return !!task.expiresAt && new Date(task.expiresAt).getTime() <= Date.now()
}

/**
 * 恢复持久化的上传任务
 * 过期任务自动取消并清除；已中止的任务直接清除
 */
async function restoreTask(record: PersistedUploadTask): Promise<FileUploadTask | null> {
  if (taskExpired(record)) {
    await cancelUploadTask(record.uploadId).catch(() => undefined)
    removeTask(record.fingerprint)
    return null
  }
  try {
    const response = await getUploadTask(record.uploadId)
    if (response.data.status === 'ABORTED' || taskExpired(response.data)) {
      removeTask(record.fingerprint)
      return null
    }
    return response.data
  } catch (error: any) {
    const code = Number(error?.response?.data?.code || error?.response?.status || 0)
    if (code === 404 || code === 410) {
      removeTask(record.fingerprint)
      return null
    }
    throw error
  }
}

/**
 * 分片上传（带重试）
 * 可重试的错误码：0（网络错误）、408（超时）、429（限流）、5xx（服务端错误）
 */
async function uploadPartWithRetry(
  uploadId: string,
  partNumber: number,
  blob: Blob,
  signal: AbortSignal | undefined,
  onLoaded: (loaded: number) => void,
) {
  let retry = 0
  while (true) {
    throwIfAborted(signal)
    try {
      await uploadFilePart(uploadId, partNumber, blob, signal, (event) => onLoaded(event.loaded))
      onLoaded(blob.size)
      return
    } catch (error) {
      onLoaded(0)
      const responseCode = Number((error as any)?.response?.data?.code || (error as any)?.response?.status || 0)
      const retryable = responseCode === 0 || responseCode === 408 || responseCode === 429 || responseCode >= 500
      if (signal?.aborted || !retryable || retry >= RETRY_DELAYS.length) throw error
      await delay(RETRY_DELAYS[retry], signal) // 递增延迟后重试
      retry += 1
    }
  }
}

/**
 * 上传会话文件（统一入口）
 *
 * 流程：
 * 1. 校验文件大小（不超过 2GB）
 * 2. 小文件：直接 uploadFile
 * 3. 大文件：
 *    a. 计算 SHA-256 哈希（Worker 线程）
 *    b. 检查本地是否有未完成的上传任务（断点续传）
 *    c. 创建或恢复上传任务
 *    d. 服务端秒传检测（fileExists）
 *    e. 并发上传缺失分片（最多 3 个并发）
 *    f. 通知服务端完成上传
 *
 * @param file - 待上传文件
 * @param conversationId - 目标会话ID
 * @param userId - 当前用户ID
 * @param options - 上传配置（取消信号、进度回调）
 * @returns 上传完成的文件信息
 */
export async function uploadConversationFile(
  file: File,
  conversationId: string,
  userId: string,
  options: UploadOptions = {},
): Promise<FileVO> {
  if (file.size <= 0) throw new Error('文件不能为空')
  if (file.size > FILE_UPLOAD_MAX_SIZE) throw new Error('文件不能超过 2GB')
  throwIfAborted(options.signal)

  // 小文件直接上传
  if (file.size <= DIRECT_UPLOAD_MAX_SIZE) {
    const response = await uploadFile(
      file,
      conversationId,
      'file',
      (progress) => options.onProgress?.({
        stage: 'uploading',
        progress,
        uploadedBytes: Math.round(file.size * progress),
        totalBytes: file.size,
      }),
      options.signal,
    )
    options.onProgress?.({ stage: 'completed', progress: 1, uploadedBytes: file.size, totalBytes: file.size })
    return response.data
  }

  // 大文件：先计算哈希
  options.onProgress?.({ stage: 'hashing', progress: 0, uploadedBytes: 0, totalBytes: file.size })
  const sha256 = await hashFile(file, (progress) => options.onProgress?.({
    stage: 'hashing',
    progress,
    uploadedBytes: Math.round(file.size * progress),
    totalBytes: file.size,
  }), options.signal)
  throwIfAborted(options.signal)

  // 断点续传：检查本地是否有未完成的上传任务
  const taskFingerprint = fingerprint(file, userId, conversationId)
  let record = findTask(taskFingerprint)
  if (record && record.sha256 !== sha256) {
    // 文件内容已变化，清除旧记录
    removeTask(taskFingerprint)
    record = undefined
  }
  let task = record ? await restoreTask(record) : null
  if (task?.status === 'COMPLETED' && task.file) {
    removeTask(taskFingerprint)
    return task.file
  }
  if (!task) {
    // 分片服务会对 image/* 执行内联图片白名单校验；文件入口明确选择的图片应保持普通文件语义。
    const taskContentType = (file.type || '').toLowerCase().startsWith('image/')
      ? 'application/octet-stream'
      : file.type || 'application/octet-stream'
    task = (await createUploadTask(file, conversationId, sha256, taskContentType)).data
    if (task.fileExists && task.file) {
      // 秒传：服务端已有相同文件
      options.onProgress?.({ stage: 'completed', progress: 1, uploadedBytes: file.size, totalBytes: file.size })
      return task.file
    }
    if (!task.uploadId) throw new Error('服务端未返回上传任务编号')
    record = {
      fingerprint: taskFingerprint,
      userId,
      conversationId,
      fileName: file.name,
      fileSize: file.size,
      lastModified: file.lastModified,
      sha256,
      uploadId: task.uploadId,
      expiresAt: task.expiresAt,
    }
    saveTask(record)
  }
  const uploadId = task.uploadId || record?.uploadId
  if (!uploadId) throw new Error('上传任务无效')

  // 计算缺失分片（跳过已上传的分片，实现断点续传）
  const uploadedParts = new Set(task.uploadedParts || [])
  const missingParts = Array.from({ length: task.chunkCount }, (_, index) => index + 1)
    .filter((partNumber) => !uploadedParts.has(partNumber))
  let completedBytes = Array.from(uploadedParts)
    .reduce((total, partNumber) => total + partSize(file.size, task!.chunkSize, partNumber), 0)
  const activeBytes = new Map<number, number>() // 正在上传中的分片已传输字节数
  const reportProgress = () => {
    const active = Array.from(activeBytes.values()).reduce((sum, value) => sum + value, 0)
    const uploadedBytes = Math.min(file.size, completedBytes + active)
    options.onProgress?.({
      stage: 'uploading',
      progress: file.size ? uploadedBytes / file.size : 0,
      uploadedBytes,
      totalBytes: file.size,
    })
  }
  reportProgress()

  // 并发上传缺失分片（最多 UPLOAD_CONCURRENCY 个并发）
  let cursor = 0
  const worker = async () => {
    while (cursor < missingParts.length) {
      const partNumber = missingParts[cursor]
      cursor += 1
      const start = (partNumber - 1) * task!.chunkSize
      const blob = file.slice(start, Math.min(file.size, start + task!.chunkSize))
      await uploadPartWithRetry(uploadId, partNumber, blob, options.signal, (loaded) => {
        activeBytes.set(partNumber, loaded)
        reportProgress()
      })
      activeBytes.delete(partNumber)
      completedBytes += blob.size
      reportProgress()
    }
  }
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, missingParts.length) }, worker))
  throwIfAborted(options.signal)
  const completed = (await completeUploadTask(uploadId, sha256)).data
  removeTask(taskFingerprint)
  options.onProgress?.({ stage: 'completed', progress: 1, uploadedBytes: file.size, totalBytes: file.size })
  return completed
}

/** 取消会话文件上传 */
export async function cancelConversationFileUpload(file: File, conversationId: string, userId: string) {
  const taskFingerprint = fingerprint(file, userId, conversationId)
  const task = findTask(taskFingerprint)
  if (!task) return
  await cancelUploadTask(task.uploadId)
  removeTask(taskFingerprint)
}
