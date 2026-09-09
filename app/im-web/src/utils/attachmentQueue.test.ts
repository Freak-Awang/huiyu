/**
 * 附件发送队列测试
 *
 * 测试场景：
 * - 按顺序处理附件
 * - 遇到失败后继续后续处理
 */
import { describe, expect, it, vi } from 'vitest'
import { createAttachmentQueue, createAttachmentTaskPersistence, runAttachmentQueue } from './attachmentQueue'

describe('attachment queue', () => {
  it('processes attachments in order', async () => {
    const processed: number[] = []
    const completed = await runAttachmentQueue([1, 2, 3], async (item) => {
      processed.push(item)
      return true
    })

    expect(completed).toBe(true)
    expect(processed).toEqual([1, 2, 3])
  })

  it('continues after a recoverable failure', async () => {
    const process = vi.fn(async (item: number) => item !== 2)
    const completed = await runAttachmentQueue([1, 2, 3], process)

    expect(completed).toBe(false)
    expect(process.mock.calls.map(([item]) => item)).toEqual([1, 2, 3])
  })

  it('serializes overlapping batches and retries only the explicitly enqueued item', async () => {
    const queue = createAttachmentQueue()
    const processed: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const first = queue.enqueue('a', async () => { processed.push('a'); await gate; return false })
    const second = queue.enqueue('b', async () => { processed.push('b'); return true })
    expect(processed).toEqual(['a'])
    release()
    expect(await first).toBe(false)
    expect(await second).toBe(true)
    await queue.enqueue('a', async () => { processed.push('a'); return true })
    expect(processed).toEqual(['a', 'b', 'a'])
  })

  it('deduplicates an active item and keeps the worker alive after exceptions', async () => {
    const queue = createAttachmentQueue()
    let reject!: (error: Error) => void
    const gate = new Promise<boolean>((_, fail) => { reject = fail })
    const first = queue.enqueue('a', () => gate)
    const duplicate = queue.enqueue('a', vi.fn())
    const next = vi.fn(async () => true)
    const second = queue.enqueue('b', next)
    expect(duplicate).toBe(first)
    reject(new Error('read failed'))
    expect(await first).toBe(false)
    expect(await second).toBe(true)
    expect(next).toHaveBeenCalledOnce()
  })

  it('clears waiting jobs during account changes without running their callbacks', async () => {
    const queue = createAttachmentQueue()
    let finish!: (value: boolean) => void
    const active = queue.enqueue('a', () => new Promise<boolean>((resolve) => { finish = resolve }))
    const run = vi.fn(async () => true)
    const waiting = queue.enqueue('b', run)
    queue.clear()
    expect(await waiting).toBe(false)
    expect(run).not.toHaveBeenCalled()
    finish(true)
    await active
  })

  it('waits for a cancelled draft save and deletion before clearing the account', async () => {
    const persistence = createAttachmentTaskPersistence()
    let save!: () => void
    let deleted!: () => void
    persistence.save('draft', new Promise<void>((resolve) => { save = resolve }))
    const remove = vi.fn(() => new Promise<void>((resolve) => { deleted = resolve }))
    const deletion = persistence.remove('draft', remove)
    const clearAccount = vi.fn()
    const disposal = Promise.allSettled(persistence.pending()).then(clearAccount)
    expect(remove).not.toHaveBeenCalled()
    save()
    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce())
    expect(clearAccount).not.toHaveBeenCalled()
    deleted()
    await deletion
    await disposal
    expect(clearAccount).toHaveBeenCalledOnce()
    expect(persistence.pending()).toEqual([])
  })

  it('still removes a cancelled task when the preceding save reports an error', async () => {
    const persistence = createAttachmentTaskPersistence()
    persistence.save('draft', Promise.reject(new Error('write response lost')))
    const remove = vi.fn(async () => undefined)
    await persistence.remove('draft', remove)
    expect(remove).toHaveBeenCalledOnce()
    expect(persistence.pending()).toEqual([])
  })
})
