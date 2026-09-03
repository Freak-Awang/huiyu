/**
 * 文件拖放工具测试
 *
 * 测试场景：
 * - 识别文件拖放 vs 纯文本拖放
 * - 嵌套拖放深度追踪（多层 DOM 元素的 enter/leave 不误触发 UI 切换）
 * - 目录拖放检测
 * - 拖放收集区分散文件与文件夹（保留相对路径）
 */
import { describe, expect, it } from 'vitest'
import {
  DragDepthTracker,
  collectDroppedItems,
  hasDirectoryDragItem,
  hasFileDragPayload,
} from './fileDrop'

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

  it('separates loose files from folders and keeps relative paths', async () => {
    const fileEntry = (name: string) => ({
      isFile: true,
      isDirectory: false,
      name,
      file: (success: (file: File) => void) => success(new File(['x'], name)),
    })
    const directoryEntry = (name: string, children: unknown[]) => ({
      isFile: false,
      isDirectory: true,
      name,
      createReader: () => {
        let consumed = false
        return {
          readEntries: (success: (entries: unknown[]) => void) => {
            success(consumed ? [] : children)
            consumed = true
          },
        }
      },
    })
    const nested = directoryEntry('docs', [
      fileEntry('nested.txt'),
      directoryEntry('inner', [fileEntry('deep.txt')]),
    ])
    const dataTransfer = {
      items: [
        { kind: 'file', webkitGetAsEntry: () => fileEntry('plain.txt') },
        { kind: 'file', webkitGetAsEntry: () => nested },
        { kind: 'string', webkitGetAsEntry: () => null },
      ],
      files: [],
    } as unknown as DataTransfer

    const { files, folders } = await collectDroppedItems(dataTransfer)
    expect(files.map((file) => file.name)).toEqual(['plain.txt'])
    expect(folders).toHaveLength(1)
    expect(folders[0].name).toBe('docs')
    expect(folders[0].files.map(({ path }) => path)).toEqual(['nested.txt', 'inner/deep.txt'])
  })

  it('falls back to dataTransfer.files when the entries API is unavailable', async () => {
    const fallback = new File(['x'], 'fallback.txt')
    const dataTransfer = {
      items: [{ kind: 'file', webkitGetAsEntry: undefined }],
      files: [fallback],
    } as unknown as DataTransfer

    const { files, folders } = await collectDroppedItems(dataTransfer)
    expect(files).toEqual([fallback])
    expect(folders).toEqual([])
  })
})
