import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  uploadFile: vi.fn(),
  createUploadTask: vi.fn(),
  getUploadTask: vi.fn(),
  uploadFilePart: vi.fn(),
  completeUploadTask: vi.fn(),
  cancelUploadTask: vi.fn(),
}))
const hash = vi.hoisted(() => vi.fn())

vi.mock('../api/file', () => ({
  DIRECT_UPLOAD_MAX_SIZE: 100 * 1024 * 1024,
  FILE_UPLOAD_MAX_SIZE: 50 * 1024 * 1024 * 1024,
  ...api,
}))
vi.mock('./fileHash', () => ({ hashFile: hash }))

import { uploadConversationFile } from './fileTransfer'

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
  clear() { this.values.clear() }
}

function file(size: number, lastModified = 123): File {
  return {
    name: 'report.bin',
    size,
    type: 'application/octet-stream',
    lastModified,
    slice: (start: number, end?: number) => ({ size: (end ?? size) - start }) as Blob,
  } as File
}

function fileVO(id = '10') {
  return { id, url: `/api/files/download/${id}`, size: 1 }
}

describe('file transfer orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true })
    hash.mockResolvedValue('abc')
    api.cancelUploadTask.mockResolvedValue({})
    api.uploadFilePart.mockResolvedValue({ data: {} })
    api.completeUploadTask.mockResolvedValue({ data: fileVO() })
  })

  it('uses direct upload at the 100 MiB boundary', async () => {
    api.uploadFile.mockResolvedValue({ data: fileVO() })

    await uploadConversationFile(file(100 * 1024 * 1024), '3', '7')

    expect(api.uploadFile).toHaveBeenCalledOnce()
    expect(api.createUploadTask).not.toHaveBeenCalled()
  })

  it('rejects files larger than 50 GiB before hashing', async () => {
    await expect(uploadConversationFile(file(50 * 1024 * 1024 * 1024 + 1), '3', '7'))
      .rejects.toThrow('50GB')
    expect(hash).not.toHaveBeenCalled()
  })

  it('accepts the exact 50 GiB boundary', async () => {
    api.createUploadTask.mockResolvedValue({
      data: { fileExists: true, file: fileVO('50'), chunkSize: 64, chunkCount: 0, uploadedParts: [] },
    })

    const result = await uploadConversationFile(file(50 * 1024 * 1024 * 1024), '3', '7')

    expect(result.id).toBe('50')
  })

  it('skips chunk upload when the server reports a second transfer', async () => {
    api.createUploadTask.mockResolvedValue({
      data: { fileExists: true, file: fileVO('88'), chunkSize: 64, chunkCount: 0, uploadedParts: [] },
    })

    const result = await uploadConversationFile(file(100 * 1024 * 1024 + 1), '3', '7')

    expect(result.id).toBe('88')
    expect(api.uploadFilePart).not.toHaveBeenCalled()
  })

  it('resumes by uploading only missing server parts', async () => {
    const largeFile = file(120 * 1024 * 1024)
    localStorage.setItem('imUploadTasksV1', JSON.stringify([{
      fingerprint: `7:3:report.bin:${120 * 1024 * 1024}:123`,
      userId: '7', conversationId: '3', fileName: 'report.bin', fileSize: 120 * 1024 * 1024,
      lastModified: 123, sha256: 'abc', uploadId: 'upload-1',
    }]))
    api.getUploadTask.mockResolvedValue({
      data: {
        uploadId: 'upload-1', fileExists: false, chunkSize: 60 * 1024 * 1024, chunkCount: 2,
        uploadedParts: [1], status: 'UPLOADING',
      },
    })

    await uploadConversationFile(largeFile, '3', '7')

    expect(api.uploadFilePart).toHaveBeenCalledTimes(1)
    expect(api.uploadFilePart).toHaveBeenCalledWith('upload-1', 2, expect.anything(), undefined, expect.any(Function))
  })

  it('never uploads more than three chunks concurrently', async () => {
    const largeFile = file(160 * 1024 * 1024)
    api.createUploadTask.mockResolvedValue({
      data: {
        uploadId: 'upload-1', fileExists: false, chunkSize: 40 * 1024 * 1024, chunkCount: 4,
        uploadedParts: [], status: 'UPLOADING',
      },
    })
    let active = 0
    let maximum = 0
    const releases: Array<() => void> = []
    api.uploadFilePart.mockImplementation(() => new Promise((resolve) => {
      active += 1
      maximum = Math.max(maximum, active)
      releases.push(() => {
        active -= 1
        resolve({ data: {} })
      })
    }))

    const result = uploadConversationFile(largeFile, '3', '7')
    await vi.waitFor(() => expect(releases).toHaveLength(3))
    releases.splice(0, 3).forEach((release) => release())
    await vi.waitFor(() => expect(releases).toHaveLength(1))
    releases.shift()?.()
    await result

    expect(maximum).toBe(3)
  })

  it('retries a failed chunk before completing', async () => {
    const largeFile = file(101 * 1024 * 1024)
    api.createUploadTask.mockResolvedValue({
      data: {
        uploadId: 'upload-1', fileExists: false, chunkSize: largeFile.size, chunkCount: 1,
        uploadedParts: [], status: 'UPLOADING',
      },
    })
    api.uploadFilePart.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ data: {} })
    const timer = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: () => void) => {
      queueMicrotask(handler)
      return 1
    }) as typeof setTimeout)

    await uploadConversationFile(largeFile, '3', '7')

    expect(api.uploadFilePart).toHaveBeenCalledTimes(2)
    timer.mockRestore()
  })
})
