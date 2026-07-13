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
      reject(new DOMException('Hashing was cancelled', 'AbortError'))
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
      else reject(new Error(message.message || 'Failed to calculate file checksum'))
    }
    worker.onerror = (event) => {
      signal?.removeEventListener('abort', abort)
      stop()
      reject(new Error(event.message || 'Failed to calculate file checksum'))
    }
    worker.postMessage({ file })
  })
}
