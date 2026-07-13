import { DIRECT_UPLOAD_MAX_SIZE, getFileUrl } from '../api/file'
import { getServerOrigin } from '../config/runtime'

interface DownloadOptions {
  fileId: string
  fileName: string
  fileSize: number
  signal?: AbortSignal
  onProgress?: (progress: number) => void
}

interface FileSystemWritableFileStream extends WritableStream {
  close(): Promise<void>
  abort(reason?: unknown): Promise<void>
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>
}

type SaveFilePicker = (options: { suggestedName: string }) => Promise<FileSystemFileHandle>

function downloadId() {
  return globalThis.crypto?.randomUUID?.() || `download-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function authHeaders() {
  const token = localStorage.getItem('token') || ''
  if (!token) throw new Error('登录状态已失效')
  return { token, headers: { Authorization: `Bearer ${token}` } }
}

async function responseError(response: Response) {
  try {
    const body = await response.json() as { message?: string }
    return body.message || `下载失败 (${response.status})`
  } catch {
    return `下载失败 (${response.status})`
  }
}

async function webDownload(options: DownloadOptions) {
  const { headers } = authHeaders()
  const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker
  if (picker) {
    const handle = await picker({ suggestedName: options.fileName })
    const writable = await handle.createWritable()
    try {
      const response = await fetch(getFileUrl(options.fileId), { headers, signal: options.signal })
      if (!response.ok || !response.body) throw new Error(await responseError(response))
      const total = Number(response.headers.get('content-length') || options.fileSize || 0)
      let received = 0
      const progress = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          received += chunk.byteLength
          options.onProgress?.(total ? Math.min(1, received / total) : 0)
          controller.enqueue(chunk)
        },
      })
      await response.body.pipeThrough(progress).pipeTo(writable)
      options.onProgress?.(1)
      return
    } catch (error) {
      await writable.abort(error).catch(() => undefined)
      throw error
    }
  }
  if (options.fileSize > DIRECT_UPLOAD_MAX_SIZE) {
    throw new Error('当前浏览器不能流式保存大文件，请使用 Chromium 新版浏览器或桌面客户端')
  }
  const response = await fetch(getFileUrl(options.fileId), { headers, signal: options.signal })
  if (!response.ok) throw new Error(await responseError(response))
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = options.fileName
  link.click()
  URL.revokeObjectURL(url)
  options.onProgress?.(1)
}

export async function downloadAuthenticatedFile(options: DownloadOptions) {
  if (!window.imDesktop?.downloadFile) {
    return webDownload(options)
  }
  const { token } = authHeaders()
  const serverOrigin = getServerOrigin()
  if (!serverOrigin) throw new Error('请先配置服务器地址')
  const id = downloadId()
  const removeProgress = window.imDesktop.onFileDownloadProgress?.((progress) => {
    if (progress.downloadId !== id || progress.state !== 'downloading') return
    options.onProgress?.(progress.total ? Math.min(1, progress.received / progress.total) : 0)
  })
  const abort = () => window.imDesktop?.cancelFileDownload?.(id)
  options.signal?.addEventListener('abort', abort, { once: true })
  try {
    const result = await window.imDesktop.downloadFile({
      downloadId: id,
      fileId: options.fileId,
      serverOrigin,
      token,
      suggestedName: options.fileName,
    })
    if (!result.success && !result.canceled) throw new Error(result.error || '下载失败')
    if (result.success) options.onProgress?.(1)
  } finally {
    options.signal?.removeEventListener('abort', abort)
    removeProgress?.()
  }
}
