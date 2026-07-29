/**
 * 文件拖放工具测试
 *
 * 测试场景：
 * - 识别文件拖放 vs 纯文本拖放
 * - 嵌套拖放深度追踪（多层 DOM 元素的 enter/leave 不误触发 UI 切换）
 * - 目录拖放检测
 */
import { describe, expect, it } from 'vitest'
import { DragDepthTracker, hasDirectoryDragItem, hasFileDragPayload } from './fileDrop'

describe('file drop helpers', () => {
  it('recognizes file payloads without intercepting text drags', () => {
    expect(hasFileDragPayload({ types: ['text/plain', 'Files'] })).toBe(true)
    expect(hasFileDragPayload({ types: ['text/plain'] })).toBe(false)
  })

  it('keeps the active state until all nested drag targets have been left', () => {
    const tracker = new DragDepthTracker()
    expect(tracker.enter()).toBe(1)
    expect(tracker.enter()).toBe(2)
    expect(tracker.leave()).toBe(1)
    expect(tracker.leave()).toBe(0)
    expect(tracker.leave()).toBe(0)
  })

  it('detects directory entries', () => {
    const items = [{ webkitGetAsEntry: () => ({ isDirectory: true }) }] as unknown as DataTransferItemList
    expect(hasDirectoryDragItem(items)).toBe(true)
  })
})
