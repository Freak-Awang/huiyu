import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DIRECT_UPLOAD_MAX_SIZE, FILE_UPLOAD_MAX_SIZE } from '../api/file'
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
      ['fallback.jpg', 'file'],
    ])
    expect(createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('rejects empty and oversized files and ignores duplicates', () => {
    const store = useAttachmentDraftStore()
    const report = file('report.pdf', 10, 'application/pdf')
    store.addFiles('conversation-1', [report])
    const result = store.addFiles('conversation-1', [
      report,
      file('empty.txt', 0, 'text/plain'),
      file('huge.png', DIRECT_UPLOAD_MAX_SIZE + 1, 'image/png'),
      file('huge.bin', FILE_UPLOAD_MAX_SIZE + 1, 'application/octet-stream'),
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
})
