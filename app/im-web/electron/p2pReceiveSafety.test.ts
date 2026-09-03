import { describe, expect, it } from 'vitest'
import { assertP2pWriteBounds, resolveP2pEntryPath, safeP2pRelativePath } from './p2pReceiveSafety'

describe('Electron P2P receive safety', () => {
  it('rejects traversal, absolute paths, empty segments and Windows device names', () => {
    expect(safeP2pRelativePath('nested\\file.txt')).toBe('nested/file.txt')
    expect(() => safeP2pRelativePath('../secret.txt')).toThrow()
    expect(() => safeP2pRelativePath('C:/secret.txt')).toThrow()
    expect(() => safeP2pRelativePath('nested//file.txt')).toThrow()
    expect(() => safeP2pRelativePath('AUX.log')).toThrow()
    expect(() => safeP2pRelativePath('nested/name ')).toThrow()
  })

  it('resolves valid entries beneath the selected temporary directory', () => {
    const target = resolveP2pEntryPath('C:\\receive\\.arttalk-temp.part', 'nested/file.txt')
    expect(target.toLowerCase()).toContain('nested\\file.txt')
  })

  it('rejects duplicate, skipped, empty, oversized and out-of-range writes', () => {
    expect(() => assertP2pWriteBounds(100, 20, 20, 10, 64)).not.toThrow()
    expect(() => assertP2pWriteBounds(100, 20, 10, 10, 64)).toThrow()
    expect(() => assertP2pWriteBounds(100, 20, 30, 10, 64)).toThrow()
    expect(() => assertP2pWriteBounds(100, 20, 20, 0, 64)).toThrow()
    expect(() => assertP2pWriteBounds(100, 20, 20, 65, 64)).toThrow()
    expect(() => assertP2pWriteBounds(100, 95, 95, 10, 64)).toThrow()
  })
})
