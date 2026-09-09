/**
 * 附件草稿 Store 单元测试：验证文件分类、大小校验、去重、会话隔离及资源释放逻辑。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DIRECT_UPLOAD_MAX_SIZE } from '../api/file'
import { P2P_MAX_FILE_SIZE, P2P_MAX_FOLDER_FILES, P2P_MAX_FOLDER_SIZE } from '../utils/p2pProtocol'
import { useAttachmentDraftStore } from './attachmentDrafts'

vi.mock('../api/index', () => ({ default: {} }))

function file(name: string, size: number, type = '', lastModified = 123): File {
  return { name, size, type, lastModified } as File
}

describe('AttachmentDraftStore', () => {
  const createObjectURL = vi.fn((value: File) => `blob:${value.name}`)
  const revokeObjectURL = vi.fn()

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
  })

  it('classifies mixed files and preserves their original order', () => {
    const store = useAttachmentDraftStore()
    const result = store.addFiles('conversation-1', [
      file('photo.png', 10, 'image/png'),
      file('clip.mp4', 20, 'video/mp4'),
      file('fallback.jpg', 30),
    ])

    expect(result.errors).toEqual([])
    expect(store.draftsFor('conversation-1').map((draft) => [draft.name, draft.kind])).toEqual([
      ['photo.png', 'image'],
      ['clip.mp4', 'file'],
      ['fallback.jpg', 'image'],
    ])
    expect(createObjectURL).toHaveBeenCalledTimes(2)
  })

  it('lets explicit picker intent override MIME classification', () => {
    const store = useAttachmentDraftStore()

    store.addFiles('conversation-1', [file('no-mime.jpg', 10)], 'image')
    store.addFiles('conversation-1', [file('send-as-file.png', 20, 'image/png')], 'file')

    expect(store.draftsFor('conversation-1').map((draft) => [draft.name, draft.kind])).toEqual([
      ['no-mime.jpg', 'image'],
      ['send-as-file.png', 'file'],
    ])
  })

  it('auto-detects only supported inline image formats', () => {
    const store = useAttachmentDraftStore()

    store.addFiles('conversation-1', [
      file('generic.webp', 10, 'application/octet-stream'),
      file('vector.svg', 20, 'image/svg+xml'),
      file('bitmap.bmp', 30, 'image/bmp'),
      file('report.jpg', 40, 'application/pdf'),
    ])

    expect(store.draftsFor('conversation-1').map((draft) => [draft.name, draft.kind])).toEqual([
      ['generic.webp', 'image'],
      ['vector.svg', 'file'],
      ['bitmap.bmp', 'file'],
      ['report.jpg', 'file'],
    ])
  })

  it('accepts zero-byte files, rejects oversized files and ignores duplicates', () => {
    const store = useAttachmentDraftStore()
    const report = file('report.pdf', 10, 'application/pdf')
    store.addFiles('conversation-1', [report])
    const result = store.addFiles('conversation-1', [
      report,
      file('empty.txt', 0, 'text/plain'),
      file('huge.png', DIRECT_UPLOAD_MAX_SIZE + 1, 'image/png'),
      file('huge.bin', P2P_MAX_FILE_SIZE + 1, 'application/octet-stream'),
    ])

    expect(result.added.map((draft) => draft.name)).toEqual(['empty.txt'])
    expect(result.duplicateCount).toBe(1)
    expect(result.errors).toHaveLength(2)
    expect(store.draftsFor('conversation-1')).toHaveLength(2)
  })

  it('keeps conversations isolated and releases resources when cleared', () => {
    const store = useAttachmentDraftStore()
    store.addFiles('conversation-1', [file('one.png', 10, 'image/png')])
    store.addFiles('conversation-2', [file('two.pdf', 20, 'application/pdf')])
    const first = store.draftsFor('conversation-1')[0]
    const controller = new AbortController()
    const abort = vi.spyOn(controller, 'abort')
    store.updateDraft('conversation-1', first.id, { controller, status: 'uploading' })

    expect(store.draftsFor('conversation-2')).toHaveLength(1)
    store.clearAll()

    expect(store.draftsFor('conversation-1')).toEqual([])
    expect(store.draftsFor('conversation-2')).toEqual([])
    expect(abort).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:one.png')
  })

  it('adds folder drafts keeping relative paths and rejects duplicates', () => {
    const store = useAttachmentDraftStore()
    const folder = {
      name: 'docs',
      files: [
        { path: 'a.txt', file: file('a.txt', 10) },
        { path: 'inner/b.txt', file: file('b.txt', 20) },
      ],
    }
    const result = store.addFolder('conversation-1', folder)

    expect(result.errors).toEqual([])
    const drafts = store.draftsFor('conversation-1')
    expect(drafts).toHaveLength(1)
    expect(drafts[0].kind).toBe('folder')
    expect(drafts[0].name).toBe('docs')
    expect(drafts[0].size).toBe(30)
    expect(drafts[0].folderFiles?.map((item) => item.path)).toEqual(['a.txt', 'inner/b.txt'])

    const duplicate = store.addFolder('conversation-1', folder)
    expect(duplicate.added).toEqual([])
    expect(duplicate.duplicateCount).toBe(1)
  })

  it('preserves empty folders and rejects the entire folder containing an oversized file', () => {
    const store = useAttachmentDraftStore()
    const empty = store.addFolder('conversation-1', { name: 'empty', files: [] })
    expect(empty.added).toHaveLength(1)
    expect(empty.errors).toEqual([])

    const result = store.addFolder('conversation-1', {
      name: 'mixed',
      files: [
        { path: 'ok.txt', file: file('ok.txt', 10) },
        { path: 'zero.txt', file: file('zero.txt', 0) },
        { path: 'huge.bin', file: file('huge.bin', P2P_MAX_FILE_SIZE + 1) },
      ],
    })
    expect(result.added).toEqual([])
    expect(result.errors).toHaveLength(1)
    expect(store.draftsFor('conversation-1').map((draft) => draft.name)).toEqual(['empty'])
  })

  it('enforces the shared P2P folder count and aggregate size limits', () => {
    const store = useAttachmentDraftStore()
    const tooMany = store.addFolder('conversation-1', {
      name: 'many',
      files: Array.from({ length: P2P_MAX_FOLDER_FILES + 1 }, (_, index) => ({
        path: `${index}.txt`, file: file(`${index}.txt`, 1),
      })),
    })
    expect(tooMany.added).toEqual([])
    expect(tooMany.errors[0]).toContain(P2P_MAX_FOLDER_FILES.toLocaleString())

    const perFileSize = P2P_MAX_FILE_SIZE
    const tooLarge = store.addFolder('conversation-1', {
      name: 'large',
      files: Array.from({ length: Math.floor(P2P_MAX_FOLDER_SIZE / perFileSize) + 1 }, (_, index) => ({
        path: `${index}.bin`, file: file(`${index}.bin`, perFileSize),
      })),
    })
    expect(tooLarge.added).toEqual([])
    expect(tooLarge.errors[0]).toContain('20GB')
  })
  it('preserves zero-byte files and nested empty directories', () => {
    const store = useAttachmentDraftStore()
    const result = store.addFolder('a', { name: 'empty tree', directories: ['nested', 'nested/empty'], files: [{ path: 'zero.txt', file: file('zero.txt', 0) }] })
    expect(result.errors).toEqual([])
    expect(result.added[0].folderDirectories).toEqual(['nested', 'nested/empty'])
    expect(result.added[0].folderFiles).toHaveLength(1)
    expect(result.added[0].size).toBe(0)
  })

  it('does not confuse different folders with the same name, size and file count', () => {
    const store = useAttachmentDraftStore()
    store.addFolder('a', { name: 'docs', files: [{ path: 'a.txt', file: file('a.txt', 4) }] })
    const second = store.addFolder('a', { name: 'docs', files: [{ path: 'b.txt', file: file('b.txt', 4) }] })
    expect(second.added).toHaveLength(1)
  })

  it('keeps native source identity and zero-byte folder statistics in the requested conversation', () => {
    const store = useAttachmentDraftStore()
    const source = { sourceId: 'source-a', kind: 'folder' as const, name: 'docs', totalSize: 0, fileCount: 0, directoryCount: 2 }
    const first = store.addNativeSources('conversation-a', [source])
    expect(store.addNativeSources('conversation-a', [source]).duplicateCount).toBe(1)
    expect(store.addNativeSources('conversation-a', [{ ...source, sourceId: 'source-b' }]).added).toHaveLength(1)
    expect(store.draftsFor('conversation-b')).toEqual([])
    expect(first.added[0].nativeSource).toEqual(source)
    store.updateDraft('conversation-a', first.added[0].id, { submitted: true, status: 'queued' })
    expect(first.added[0].submitted).toBe(true)
  })

  it('restores a submitted native task with the same id and waits for manual continuation', () => {
    const store = useAttachmentDraftStore()
    const source = { sourceId: 'source-a', kind: 'file' as const, name: 'report.txt', totalSize: 3, fileCount: 1, directoryCount: 0 }
    const restored = store.restoreNativeDraft('original-id', 'conversation-a', source)
    expect(restored.id).toBe('original-id')
    expect(restored.status).toBe('paused')
    expect(restored.submitted).toBe(true)
    expect(restored.error).toContain('手动继续')
    store.restoreNativeDraft('original-id', 'conversation-a', source)
    expect(store.draftsFor('conversation-a')).toHaveLength(1)
  })

})
