/**
 * 附件发送队列测试
 *
 * 测试场景：
 * - 按顺序处理附件
 * - 遇到失败后停止后续处理
 */
import { describe, expect, it, vi } from 'vitest'
import { runAttachmentQueue } from './attachmentQueue'

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

  it('stops after the first recoverable failure', async () => {
    const process = vi.fn(async (item: number) => item !== 2)
    const completed = await runAttachmentQueue([1, 2, 3], process)

    expect(completed).toBe(false)
    expect(process.mock.calls.map(([item]) => item)).toEqual([1, 2])
  })
})
