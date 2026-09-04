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

  it('rejects empty and oversized files and ignores duplicates', () => {
    const store = useAttachmentDraftStore()
    const report = file('report.pdf', 10, 'application/pdf')
    store.addFiles('conversation-1', [report])
    const result = store.addFiles('conversation-1', [
      report,
      file('empty.txt', 0, 'text/plain'),
      file('huge.png', DIRECT_UPLOAD_MAX_SIZE + 1, 'image/png'),
      file('huge.bin', P2P_MAX_FILE_SIZE + 1, 'application/octet-stream'),
    ])

    expect(result.added).toEqual([])
    expect(result.duplicateCount).toBe(1)
    expect(result.errors).toHaveLength(3)
    expect(store.draftsFor('conversation-1')).toHaveLength(1)
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

  it('filters empty and oversized files when adding folders', () => {
    const store = useAttachmentDraftStore()
    const empty = store.addFolder('conversation-1', { name: 'empty', files: [] })
    expect(empty.added).toEqual([])
    expect(empty.errors).toEqual(['empty：文件夹为空'])

    const result = store.addFolder('conversation-1', {
      name: 'mixed',
      files: [
        { path: 'ok.txt', file: file('ok.txt', 10) },
        { path: 'zero.txt', file: file('zero.txt', 0) },
        { path: 'huge.bin', file: file('huge.bin', P2P_MAX_FILE_SIZE + 1) },
      ],
    })
    expect(result.added).toHaveLength(1)
    expect(result.errors).toHaveLength(2)
    expect(result.added[0].folderFiles?.map((item) => item.path)).toEqual(['ok.txt'])
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
})
