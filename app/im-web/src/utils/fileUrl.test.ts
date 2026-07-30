import { describe, expect, it } from 'vitest'
import { extractFileDownloadId } from './fileUrl'

describe('file URL helpers', () => {
  it('extracts file IDs from relative and absolute download URLs', () => {
    expect(extractFileDownloadId('/api/files/download/99')).toBe('99')
    expect(extractFileDownloadId('https://im.example.test/api/files/download/100?preview=1')).toBe('100')
    expect(extractFileDownloadId('http://localhost:8080/api/files/download/101#image')).toBe('101')
  })

  it('ignores unrelated URLs and malformed file IDs', () => {
    expect(extractFileDownloadId('https://cdn.example.test/avatar.png')).toBe('')
    expect(extractFileDownloadId('/api/files/download/not-a-number')).toBe('')
    expect(extractFileDownloadId('')).toBe('')
  })
})
