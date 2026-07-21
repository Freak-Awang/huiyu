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
const UPLOAD_CONCURRENCY = 3
const RETRY_DELAYS = [1000, 2000, 4000]

export type FileTransferStage = 'hashing' | 'uploading' | 'completed'

export interface FileTransferProgress {
  stage: FileTransferStage
  progress: number
  uploadedBytes: number
  totalBytes: number
}

interface PersistedUploadTask {
  fingerprint: string
  userId: string
  conversationId: string
  fileName: string
  fileSize: number
  lastModified: number
  sha256: string
  uploadId: string
  expiresAt?: string
}

interface UploadOptions {
  signal?: AbortSignal
  onProgress?: (progress: FileTransferProgress) => void
}

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
  if (signal?.aborted) throw new DOMException('Upload was paused', 'AbortError')
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
      reject(new DOMException('Upload was paused', 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })
  })
}

function partSize(fileSize: number, chunkSize: number, partNumber: number) {
  const start = (partNumber - 1) * chunkSize
  return Math.max(0, Math.min(chunkSize, fileSize - start))
}

function taskExpired(task: PersistedUploadTask | FileUploadTask) {
  return !!task.expiresAt && new Date(task.expiresAt).getTime() <= Date.now()
}

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
      await delay(RETRY_DELAYS[retry], signal)
      retry += 1
    }
  }
}

export async function uploadConversationFile(
  file: File,
  conversationId: string,
  userId: string,
  options: UploadOptions = {},
): Promise<FileVO> {
  if (file.size <= 0) throw new Error('文件不能为空')
  if (file.size > FILE_UPLOAD_MAX_SIZE) throw new Error('文件不能超过 50GB')
  throwIfAborted(options.signal)

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

  options.onProgress?.({ stage: 'hashing', progress: 0, uploadedBytes: 0, totalBytes: file.size })
  const sha256 = await hashFile(file, (progress) => options.onProgress?.({
    stage: 'hashing',
    progress,
    uploadedBytes: Math.round(file.size * progress),
    totalBytes: file.size,
  }), options.signal)
  throwIfAborted(options.signal)

  const taskFingerprint = fingerprint(file, userId, conversationId)
  let record = findTask(taskFingerprint)
  if (record && record.sha256 !== sha256) {
    removeTask(taskFingerprint)
    record = undefined
  }
  let task = record ? await restoreTask(record) : null
  if (task?.status === 'COMPLETED' && task.file) {
    removeTask(taskFingerprint)
    return task.file
  }
  if (!task) {
    task = (await createUploadTask(file, conversationId, sha256)).data
    if (task.fileExists && task.file) {
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

  const uploadedParts = new Set(task.uploadedParts || [])
  const missingParts = Array.from({ length: task.chunkCount }, (_, index) => index + 1)
    .filter((partNumber) => !uploadedParts.has(partNumber))
  let completedBytes = Array.from(uploadedParts)
    .reduce((total, partNumber) => total + partSize(file.size, task!.chunkSize, partNumber), 0)
  const activeBytes = new Map<number, number>()
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

export async function cancelConversationFileUpload(file: File, conversationId: string, userId: string) {
  const taskFingerprint = fingerprint(file, userId, conversationId)
  const task = findTask(taskFingerprint)
  if (!task) return
  await cancelUploadTask(task.uploadId)
  removeTask(taskFingerprint)
}
