/**
 * 文件哈希计算工具
 *
 * 通过 Web Worker 在后台线程计算文件的 SHA-256 哈希值，避免阻塞主线程 UI。
 * 支持进度回传和取消操作。
 * 用于大文件上传的秒传判断和分片校验。
 */

/**
 * 计算文件 SHA-256 哈希
 * 创建 Worker 线程异步计算，通过 Promise 返回结果
 * @param file - 目标文件
 * @param onProgress - 进度回调（0-1）
 * @param signal - 取消信号
 * @returns SHA-256 十六进制哈希字符串
 */
export function hashFile(
  file: File,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/fileHash.worker.ts', import.meta.url), { type: 'module' })
    const stop = () => worker.terminate()
    const abort = () => {
      stop()
      reject(new DOMException('哈希计算已取消', 'AbortError'))
    }
    if (signal?.aborted) {
      abort()
      return
    }
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<{ type: string; loaded?: number; total?: number; sha256?: string; message?: string }>) => {
      const message = event.data
      if (message.type === 'progress') {
        onProgress?.(message.total ? Number(message.loaded || 0) / message.total : 0)
        return
      }
      signal?.removeEventListener('abort', abort)
      stop()
      if (message.type === 'complete' && message.sha256) resolve(message.sha256)
      else reject(new Error(message.message || '文件哈希计算失败'))
    }
    worker.onerror = (event) => {
      signal?.removeEventListener('abort', abort)
      stop()
      reject(new Error(event.message || '文件哈希计算失败'))
    }
    worker.postMessage({ file })
  })
}
