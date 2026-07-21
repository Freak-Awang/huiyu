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
