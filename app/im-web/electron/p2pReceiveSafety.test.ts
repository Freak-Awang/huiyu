import { resolve } from 'node:path'
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
    const root = resolve('.arttalk-temp.part')
    const target = resolveP2pEntryPath(root, 'nested/file.txt')

    expect(target).toBe(resolve(root, 'nested', 'file.txt'))
  })

  it('rejects duplicate, skipped, empty, oversized and out-of-range writes', () => {
    expect(() => assertP2pWriteBounds(100, 20, 20, 10, 64)).not.toThrow()
    expect(() => assertP2pWriteBounds(100, 20, 10, 10, 64)).toThrow()
    expect(() => assertP2pWriteBounds(100, 20, 30, 10, 64)).toThrow()
    expect(() => assertP2pWriteBounds(100, 20, 20, 0, 64)).toThrow()
    expect(() => assertP2pWriteBounds(100, 20, 20, 65, 64)).toThrow()
    expect(() => assertP2pWriteBounds(100, 95, 95, 10, 64)).toThrow()
  })

  it('allows writes past 4 GiB while rejecting unsafe arithmetic', () => {
    const offset = 4 * 1024 ** 3 + 17
    expect(() => assertP2pWriteBounds(offset + 64, offset, offset, 64, 64)).not.toThrow()
    expect(() => assertP2pWriteBounds(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER - 1, 1, 64)).not.toThrow()
    expect(() => assertP2pWriteBounds(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1, 64)).toThrow()
    for (const size of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => assertP2pWriteBounds(size, 0, 0, 1, 64)).toThrow()
    }
    expect(() => assertP2pWriteBounds(10, -1, -1, 1, 64)).toThrow()
  })
})
