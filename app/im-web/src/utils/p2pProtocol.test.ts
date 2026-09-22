import { describe, expect, it, vi } from 'vitest'

const { hashFileMock } = vi.hoisted(() => ({
  hashFileMock: vi.fn(async (_file: File, onProgress?: (progress: number) => void) => {
    onProgress?.(1)
    return 'a'.repeat(64)
  }),
}))

vi.mock('./fileHash', () => ({ hashFile: hashFileMock }))

import {
  P2P_CHUNK_SIZE,
  P2P_MANIFEST_TEXT_CHUNK,
  decodeP2pDataFrame,
  encodeP2pDataFrame,
  normalizeP2pRelativePath,
  parseP2pAttachmentContent,
  prepareP2pFolder,
  prepareP2pFile,
  validateP2pManifestStructure,
  p2pOfferSummary,
  splitP2pManifest,
  verifyP2pManifest,
} from './p2pProtocol'

function file(name: string, size: number): File {
  return { name, size, type: 'application/octet-stream' } as File
}

describe('P2P attachment protocol', () => {
  it('normalizes safe relative paths and rejects traversal and Windows device names', () => {
    expect(normalizeP2pRelativePath('docs\\nested/a.txt', 'docs')).toBe('nested/a.txt')
    expect(() => normalizeP2pRelativePath('../secret.txt')).toThrow(/不安全路径/)
    expect(() => normalizeP2pRelativePath('C:/secret.txt')).toThrow(/绝对路径/)
    expect(() => normalizeP2pRelativePath('inner/CON.txt')).toThrow(/不安全路径/)
    expect(() => normalizeP2pRelativePath('inner/name.')).toThrow(/不安全路径/)
  })

  it('sorts folder manifests deterministically and hashes the stable summary', async () => {
    const progress: number[] = []
    const prepared = await prepareP2pFolder('docs', [
      { path: 'docs/z.txt', file: file('z.txt', 3) },
      { path: 'docs/a.txt', file: file('a.txt', 2) },
    ], (value) => progress.push(value))

    expect(prepared.manifest.files.map((entry) => entry.path)).toEqual(['a.txt', 'z.txt'])
    expect(prepared.manifest.totalSize).toBe(5)
    expect(prepared.manifest.fileCount).toBe(2)
    expect(await verifyP2pManifest(prepared.manifest)).toBe(true)
    expect(progress.at(-1)).toBe(1)
  })

  it('rejects paths that collide after case-normalization', async () => {
    await expect(prepareP2pFolder('docs', [
      { path: 'A.txt', file: file('A.txt', 1) },
      { path: 'a.txt', file: file('a.txt', 1) },
    ])).rejects.toThrow(/重复路径/)

    await expect(prepareP2pFolder('docs', [
      { path: 'caf\u00e9.txt', file: file('one.txt', 1) },
      { path: 'cafe\u0301.txt', file: file('two.txt', 1) },
    ])).rejects.toThrow(/重复路径/)
  })

  it('round-trips fixed-header binary frames and rejects a forged length', () => {
    const payload = new Uint8Array(P2P_CHUNK_SIZE).map((_, index) => index % 251).buffer
    const frame = encodeP2pDataFrame(7, 4_294_967_300, payload)
    const decoded = decodeP2pDataFrame(frame)

    expect(decoded.fileIndex).toBe(7)
    expect(decoded.offset).toBe(4_294_967_300)
    expect(new Uint8Array(decoded.payload)).toEqual(new Uint8Array(payload))
    new DataView(frame).setUint32(12, payload.byteLength - 1, true)
    expect(() => decodeP2pDataFrame(frame)).toThrow(/长度不匹配/)
  })

  it('splits a large manifest into bounded ordered control payloads', async () => {
    const prepared = await prepareP2pFolder('docs', Array.from({ length: 300 }, (_, index) => ({
      path: `nested/${String(index).padStart(4, '0')}-${'x'.repeat(80)}.txt`,
      file: file(`${index}.txt`, 1),
    })))
    const parts = splitP2pManifest(prepared.manifest)

    expect(parts.length).toBeGreaterThan(1)
    expect(parts.every((part) => part.length <= P2P_MANIFEST_TEXT_CHUNK)).toBe(true)
    expect(JSON.parse(parts.join(''))).toEqual(prepared.manifest)
  })

  it('parses only P2P v1 attachment summaries', () => {
    const valid = JSON.stringify({
      version: 1,
      transferMode: 'p2p_lan',
      transferId: 'p2p_abc123',
      kind: 'file',
      name: 'report.pdf',
      totalSize: 10,
      fileCount: 1,
      sha256: 'a'.repeat(64),
    })
    expect(parseP2pAttachmentContent(valid)?.name).toBe('report.pdf')
    expect(parseP2pAttachmentContent(valid.replace('p2p_lan', 'object_storage'))).toBeNull()
    expect(parseP2pAttachmentContent('{bad json')).toBeNull()
  })

  it('preserves empty files and all empty directories in the authenticated v2 manifest', async () => {
    const prepared = await prepareP2pFolder('docs', [{ path: 'empty.txt', file: file('empty.txt', 0) }],
      undefined, undefined, ['nested', 'nested/empty'])
    expect(prepared.manifest.directories).toEqual(['nested', 'nested/empty'])
    expect(prepared.manifest.fileCount).toBe(1)
    expect(prepared.manifest.totalSize).toBe(0)
    expect(await verifyP2pManifest(prepared.manifest)).toBe(true)
    prepared.manifest.directories!.pop()
    expect(await verifyP2pManifest(prepared.manifest)).toBe(false)
  })

  it('supports an empty root folder and a standalone zero-byte file', async () => {
    const folder = await prepareP2pFolder('empty', [])
    const emptyFile = await prepareP2pFile(file('empty.txt', 0))
    for (const source of [folder, emptyFile]) {
      expect(() => validateP2pManifestStructure(source.manifest)).not.toThrow()
      expect(parseP2pAttachmentContent(JSON.stringify({ transferId: 'p2p_empty', transferMode: 'p2p_lan', ...p2pOfferSummary(source) }))).not.toBeNull()
    }
  })

  it('rejects a folder as a whole if a directory conflicts', async () => {
    await expect(prepareP2pFolder('docs', [{ path: 'same', file: file('same', 0) }], undefined, undefined, ['same']))
      .rejects.toThrow(/条目无效/)
  })

  it('prepares, parses and validates large files and folders without a business size cap', async () => {
    const largeFile = await prepareP2pFile(file('large.bin', 2 * 1024 ** 3 + 1))
    const largeFolder = await prepareP2pFolder('large', [
      { path: 'first.bin', file: file('first.bin', 12 * 1024 ** 3) },
      { path: 'second.bin', file: file('second.bin', 12 * 1024 ** 3) },
    ])
    const largestSafe = await prepareP2pFile(file('safe.bin', Number.MAX_SAFE_INTEGER))
    for (const source of [largeFile, largeFolder, largestSafe]) {
      expect(() => validateP2pManifestStructure(source.manifest)).not.toThrow()
      expect(await verifyP2pManifest(source.manifest)).toBe(true)
      for (const version of [1, 2]) {
        expect(parseP2pAttachmentContent(JSON.stringify({ ...p2pOfferSummary(source),
          version, transferMode: 'p2p_lan', transferId: 'p2p_large' }))?.totalSize).toBe(source.manifest.totalSize)
      }
    }
  })

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid sizes (%s) before hashing', async (size) => {
    hashFileMock.mockClear()
    await expect(prepareP2pFile(file('bad', size))).rejects.toThrow(/大小无效/)
    await expect(prepareP2pFolder('bad', [{ path: 'bad', file: file('bad', size) }])).rejects.toThrow(/大小无效/)
    expect(hashFileMock).not.toHaveBeenCalled()
    const valid = await prepareP2pFile(file('valid', 1))
    expect(() => validateP2pManifestStructure({ ...valid.manifest, totalSize: size })).toThrow()
    expect(() => validateP2pManifestStructure({ ...valid.manifest, files: [{ ...valid.manifest.files[0], size }] })).toThrow()
    expect(parseP2pAttachmentContent(JSON.stringify({ ...p2pOfferSummary(valid), transferMode: 'p2p_lan',
      transferId: 'p2p_bad', totalSize: size }))).toBeNull()
  })

  it('rejects aggregate overflow before hashing', async () => {
    hashFileMock.mockClear()
    await expect(prepareP2pFolder('overflow', [
      { path: 'a', file: file('a', Number.MAX_SAFE_INTEGER) }, { path: 'b', file: file('b', 1) },
    ])).rejects.toThrow(/可精确表示/)
    expect(hashFileMock).not.toHaveBeenCalled()
  })

  it('rejects unsafe and overflowing binary offsets without rounding them', () => {
    const payload = new Uint8Array([1]).buffer
    for (const offset of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => encodeP2pDataFrame(0, offset, payload)).toThrow()
    }
    const frame = encodeP2pDataFrame(0, Number.MAX_SAFE_INTEGER - 1, payload)
    expect(decodeP2pDataFrame(frame).offset).toBe(Number.MAX_SAFE_INTEGER - 1)
    for (const offset of [BigInt(Number.MAX_SAFE_INTEGER), 2n ** 64n - 1n]) {
      new DataView(frame).setBigUint64(4, offset, true)
      expect(() => decodeP2pDataFrame(frame)).toThrow()
    }
    expect(() => encodeP2pDataFrame(0, 0, new ArrayBuffer(P2P_CHUNK_SIZE + 1))).toThrow()
    expect(() => encodeP2pDataFrame(0, 0, new ArrayBuffer(0))).toThrow()
  })
})
