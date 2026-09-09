import { describe, expect, it } from 'vitest'
import { createSSRApp, effectScope, ref } from 'vue'
import { renderToString } from '@vue/server-renderer'
import TransferCenter, { primaryTransferAction, transferActions, transferProgressText, transferProgressValue, transferStatusLabel, useTransferPagination, type TransferCenterItem } from './TransferCenter.vue'

const task = (changes: Partial<TransferCenterItem> = {}): TransferCenterItem => ({ transferId: 'one', direction: 'send', status: 'sending', totalBytes: 1024, transferredBytes: 512, ...changes })

describe('transfer center presentation', () => {
  it('distinguishes cancellation, recovery and checksum verification', () => {
    expect(transferStatusLabel(task({ status: 'cancelled' }))).toBe('已取消')
    expect(transferStatusLabel(task({ status: 'paused', pauseReason: 'restart' }))).toContain('手动继续')
    expect(transferStatusLabel(task({ phase: 'verifying' }))).toContain('校验接收文件')
  })

  it('keeps zero-byte and unknown-speed progress readable', () => {
    const text = transferProgressText(task({ totalBytes: 0, transferredBytes: 0, kind: 'folder', fileCount: 0 }))
    expect(text).toBe('完整目录结构（含空目录）')
    expect(text).not.toMatch(/NaN|Infinity/)
    expect(transferProgressText(task({ speedBytesPerSecond: 1024, etaSeconds: 90 }))).toContain('1.0 KB/s · 约剩 2 分钟')
  })

  it('uses processing-stage bytes instead of the completed network progress', () => {
    const verifying = task({ direction: 'receive', status: 'verifying', totalBytes: 4096, transferredBytes: 4096, progress: 1, phaseProcessedBytes: 256, phaseTotalBytes: 1024, speedBytesPerSecond: 1000 })
    expect(transferProgressValue(verifying)).toBe(0.25)
    expect(transferProgressText(verifying)).toBe('校验 256 B / 1.0 KB')
    const committing = { ...verifying, status: 'committing', phaseProcessedBytes: 512 }
    expect(transferProgressValue(committing)).toBe(0.5)
    expect(transferProgressText(committing)).toBe('保存 512 B / 1.0 KB')
    expect(primaryTransferAction(committing)?.value).toBe('pause')
    expect(transferProgressValue({ ...verifying, phaseProcessedBytes: undefined })).toBeUndefined()
    expect(transferProgressText({ ...verifying, phaseProcessedBytes: undefined })).toBe('校验中')
    expect(transferProgressValue(task({ phase: 'committing', progress: 1, phaseProcessedBytes: 1, phaseTotalBytes: 4 }))).toBe(0.25)
  })

  it('describes empty structures and never renders a meaningless zero-byte progress bar', async () => {
    const empty = task({ kind: 'folder', name: '空目录', status: 'committing', totalBytes: 0, directoryCount: 3, fileCount: 2, phaseProcessedBytes: 0, phaseTotalBytes: 0 })
    expect(transferProgressValue(empty)).toBeUndefined()
    expect(transferProgressText(empty)).toBe('完整目录结构（含空目录） · 3 个子目录 · 2 个空文件')
    expect(transferProgressText(task({ kind: 'file', totalBytes: 0 }))).toBe('空文件')
    const html = await renderToString(createSSRApp(TransferCenter, { open: true, items: [empty], busyIds: [] }))
    expect(html).not.toContain('<progress')
    expect(html).not.toContain('0 B / 0 B')
    expect(html).toContain('完整目录结构')
  })

  it('pages every retained task, resets after filtering and clamps after tasks disappear', () => {
    const items = ref(Array.from({ length: 123 }, (_, index) => task({ taskId: `task-${index}`, status: index < 80 ? 'completed' : 'waiting' })))
    const scope = effectScope()
    const view = scope.run(() => useTransferPagination(() => items.value))!
    try {
      expect(view.pageCount.value).toBe(3)
      const seen: string[] = []
      for (let page = 1; page <= 3; page++) {
        view.page.value = page
        expect(view.visibleItems.value.length).toBeLessThanOrEqual(50)
        seen.push(...view.visibleItems.value.map((item) => item.taskId!))
      }
      expect(seen).toEqual(items.value.map((item) => item.taskId))
      view.selected.value = 'completed'
      expect(view.page.value).toBe(1)
      expect(view.totalItems.value).toBe(80)
      view.page.value = 2
      expect(view.visibleItems.value).toHaveLength(30)
      view.selected.value = 'attention'
      expect(view.page.value).toBe(1)
      expect(view.visibleItems.value).toEqual([])
      view.selected.value = 'all'
      view.page.value = 3
      items.value = items.value.slice(0, 51)
      expect(view.page.value).toBe(2)
      expect(view.visibleItems.value).toHaveLength(1)
    } finally { scope.stop() }
  })

  it('renders only one page while retaining the total history count', async () => {
    const items = Array.from({ length: 123 }, (_, index) => task({ taskId: `task-${index}`, name: `历史文件${index}`, status: 'completed' }))
    const html = await renderToString(createSSRApp(TransferCenter, { open: true, items, busyIds: [] }))
    expect(html.match(/class="transfer-item"/g)).toHaveLength(50)
    expect(html).toContain('共 123 条')
    expect(html).toContain('上一页')
    expect(html).toContain('下一页')
    expect(items).toHaveLength(123)
  })

  it('allows a sender to pause and retry without stopping the share', () => {
    expect(transferActions(task()).map((item) => item.value)).toEqual(['pause', 'cancel', 'stopSharing'])
    expect(transferActions(task({ status: 'failed' })).map((item) => item.value)).toContain('resume')
    expect(transferActions(task({ status: 'completed' })).map((item) => item.value)).toEqual(['pause', 'stopSharing'])
    expect(transferActions(task({ status: 'waiting' })).map((item) => item.value)).toEqual(['pause', 'stopSharing'])
    expect(transferActions(task({ status: 'paused' })).map((item) => item.value)).toEqual(['resume', 'stopSharing', 'locateSource'])
  })

  it('shares primary actions between message bubbles and the center', () => {
    expect(primaryTransferAction(task({ status: 'completed' }))).toEqual({ value: 'pause', label: '暂停分享' })
    expect(primaryTransferAction(task({ status: 'completed', direction: 'receive' }))?.value).toBe('open')
    expect(primaryTransferAction(task({ status: 'cancelled', direction: 'receive' }))?.value).toBe('receiveAgain')
    expect(primaryTransferAction(task({ status: 'completed', shareState: 'STOPPED' }))).toBeUndefined()
    expect(primaryTransferAction(task({ status: 'paused', shareState: 'RECALLED' }))).toBeUndefined()
    expect(primaryTransferAction(task({ status: 'failed', direction: 'receive', shareState: 'STOPPED' }))).toBeUndefined()
    expect(primaryTransferAction(task({ status: 'completed', direction: 'receive', shareState: 'RECALLED' }))?.value).toBe('open')
  })

  it('offers result recovery after completion and isolates draft actions', () => {
    expect(transferActions(task({ direction: 'receive', status: 'completed' })).map((item) => item.value)).toEqual(['open', 'reveal', 'locateResult', 'receiveAgain'])
    expect(transferActions(task({ draft: true, status: 'failed' })).map((item) => item.value)).toEqual(['resume', 'cancel'])
    expect(transferActions(task({ status: 'recalled' }))).toEqual([])
    expect(transferActions(task({ direction: 'receive', status: 'cancelled' })).map((item) => item.value)).toEqual(['receiveAgain'])
    expect(transferActions(task({ direction: 'receive', status: 'completed', shareState: 'STOPPED' })).map((item) => item.value)).toEqual(['open', 'reveal', 'locateResult'])
  })

  it('retries cleanup without resuming cancelled or recalled transfers', () => {
    for (const status of ['cancelled', 'recalled']) {
      const pending = task({ taskId: 'old-receive', direction: 'receive', status, cleanupPending: true, cleanupError: '磁盘离线', shareState: status === 'recalled' ? 'RECALLED' : 'ACTIVE' })
      expect(transferStatusLabel(pending)).toContain('临时文件待清理')
      expect(transferActions(pending)).toEqual([{ value: 'retryCleanup', label: '重试清理' }])
      expect(primaryTransferAction(pending)).toBeUndefined()
    }
    const cleaned = task({ direction: 'receive', status: 'cancelled', cleanupPending: false })
    expect(transferStatusLabel(cleaned)).toBe('已取消')
    expect(transferActions(cleaned)).toEqual([{ value: 'receiveAgain', label: '重新接收' }])
  })
})
