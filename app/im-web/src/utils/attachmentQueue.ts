/**
 * 附件发送队列工具
 *
 * 按顺序逐个处理附件，单项失败不阻断其他任务。
 * 用于消息发送时附件上传的串行化控制，保证附件按用户选择的顺序发送。
 */

/**
 * 串行执行附件队列
 * @param items - 待处理的附件列表
 * @param process - 单个附件处理函数，返回成功或失败；失败不阻断其他项
 * @returns 是否全部处理成功
 */
export async function runAttachmentQueue<T>(
  items: T[],
  process: (item: T) => Promise<boolean>,
) {
  let completed = true
  for (const item of items) {
    try { if (!await process(item)) completed = false } catch { completed = false }
  }
  return completed
}

/** One preparation worker shared by all conversations and send batches. */
export function createAttachmentQueue() {
  const jobs: Array<{ key: string; run: () => Promise<boolean>; resolve: (result: boolean) => void }> = []
  const pending = new Map<string, Promise<boolean>>()
  let running = false
  async function drain() {
    if (running) return
    running = true
    try {
      while (jobs.length) {
        const job = jobs.shift()!
        let result = false
        try { result = await job.run() } catch { /* Individual failures do not stop the worker. */ }
        pending.delete(job.key)
        job.resolve(result)
      }
    } finally { running = false }
  }
  return {
    waitFor(key: string) { return pending.get(key) },
    enqueue(key: string, run: () => Promise<boolean>) {
      const existing = pending.get(key)
      if (existing) return existing
      let resolve!: (result: boolean) => void
      const promise = new Promise<boolean>((done) => { resolve = done })
      pending.set(key, promise)
      jobs.push({ key, run, resolve })
      void drain()
      return promise
    },
    clear() {
      for (const job of jobs.splice(0)) { pending.delete(job.key); job.resolve(false) }
    },
  }
}

/** Keep cancellation ordered after its save, and expose barriers for account disposal. */
export function createAttachmentTaskPersistence() {
  const saves = new Map<string, Promise<unknown>>()
  const operations = new Set<Promise<unknown>>()
  function track<T>(operation: Promise<T>) {
    operations.add(operation)
    void operation.then(() => operations.delete(operation), () => operations.delete(operation))
    return operation
  }
  return {
    save(key: string, operation: Promise<unknown>) {
      saves.set(key, operation)
      return track(operation)
    },
    remove(key: string, remove: () => Promise<unknown>) {
      const save = saves.get(key)
      return track((async () => {
        if (save) await Promise.allSettled([save])
        if (saves.get(key) === save) saves.delete(key)
        await remove()
      })())
    },
    pending() { return [...operations] },
  }
}
