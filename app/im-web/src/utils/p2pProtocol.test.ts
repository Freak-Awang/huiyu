import { describe, expect, it, vi } from 'vitest'

const { hashFileMock } = vi.hoisted(() => ({
  hashFileMock: vi.fn(async (file: File, onProgress?: (progress: number) => void) => {
    onProgress?.(1)
    return file.name.padEnd(64, '0').slice(0, 64)
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
})
