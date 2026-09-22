import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Keep real path/permission checks, but simulate large file metadata and I/O.
// No large allocation, sparse file, or multi-gigabyte hash pass is required.
const disk = vi.hoisted(() => ({
  files: new Map<string, { size: number; sample: Buffer; ranges: Map<string, Buffer> }>(),
  reads: [] as number[], writes: [] as number[], truncates: [] as number[],
  streams: [] as Array<{ start: number; end?: number }>,
}))
vi.mock('node:fs', async (original) => {
  const real = await original<typeof import('node:fs')>()
  const { Readable } = await import('node:stream')
  return { ...real, createReadStream: (path: string, options: { start?: number; end?: number } = {}) => {
    const file = disk.files.get(String(path))
    if (!file) return real.createReadStream(path, options)
    const start = options.start || 0
    disk.streams.push({ start, end: options.end })
    return Readable.from([file.ranges.get(`${start}:${options.end}`) || file.sample])
  } }
})
vi.mock('node:fs/promises', async (original) => {
  const real = await original<typeof import('node:fs/promises')>()
  const { Readable } = await import('node:stream')
  const metadata = (path: string, info: Awaited<ReturnType<typeof real.stat>>) => {
    const file = disk.files.get(String(path))
    return file ? Object.assign(Object.create(Object.getPrototypeOf(info)), info, { size: file.size }) : info
  }
  return { ...real,
    stat: async (path: string) => metadata(path, await real.stat(path)),
    lstat: async (path: string) => metadata(path, await real.lstat(path)),
    open: async (path: string, flags: string) => {
      const handle = await real.open(path, flags)
      const file = disk.files.get(String(path))
      if (!file) return handle
      const overrides: Record<string, unknown> = {
        stat: async () => metadata(path, await handle.stat()),
        createReadStream: () => Readable.from([file.sample]),
        read: async (buffer: Uint8Array, bufferOffset: number, length: number, position: number) => {
          disk.reads.push(position)
          buffer.set(file.sample.subarray(0, length), bufferOffset)
          return { bytesRead: length, buffer }
        },
        write: async (buffer: Buffer, bufferOffset: number, length: number, position: number) => {
          disk.writes.push(position)
          file.ranges.set(`${position}:${position + length - 1}`, Buffer.from(buffer.subarray(bufferOffset, bufferOffset + length)))
          file.size = Math.max(file.size, position + length)
          return { bytesWritten: length, buffer }
        },
        truncate: async (size: number) => { disk.truncates.push(size); file.size = size },
      }
      return new Proxy(handle, { get(target, key) {
        if (typeof key === 'string' && key in overrides) return overrides[key]
        const value = Reflect.get(target, key, target)
        return typeof value === 'function' ? value.bind(target) : value
      } })
    },
  }
})

import { P2pSourceStore, scanP2pSource } from './p2pSources'
import { manifestHash, P2pReceiver, validateReceiveManifest, type ReceiveManifest } from './p2pReceive'
import type { NativeTask } from './p2pTaskStorage'

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
describe('native P2P large-file boundaries', () => {
  let directory: string
  let receivers: P2pReceiver[]
  beforeEach(async () => {
    disk.files.clear(); disk.reads = []; disk.writes = []; disk.truncates = []; disk.streams = []
    receivers = []
    directory = await mkdtemp(join(tmpdir(), 'arttalk-p2p-large-test-'))
  })
  afterEach(async () => {
    for (const receiver of receivers) await receiver.suspend('manual')
    const path = resolve(directory)
    if (dirname(path).toLowerCase() !== resolve(tmpdir()).toLowerCase() || !basename(path).startsWith('arttalk-p2p-large-test-')) throw new Error('Unsafe test cleanup')
    await rm(path, { recursive: true, force: true })
  })
  async function virtualFile(name: string, size: number, sample = Buffer.from('abc')) {
    const path = join(directory, name)
    await writeFile(path, sample)
    disk.files.set(path, { size, sample, ranges: new Map() })
    return path
  }
  function manifest(size: number, kind: 'file' | 'folder' = 'file'): ReceiveManifest {
    const value: ReceiveManifest = { version: 2, kind, name: 'large.bin', totalSize: size, fileCount: 1, directories: [],
      files: [{ index: 0, path: 'large.bin', name: 'large.bin', size, contentType: 'application/octet-stream', sha256: 'a'.repeat(64) }], manifestSha256: '' }
    value.manifestSha256 = manifestHash(value)
    return value
  }

  it('scans and revalidates large sources, reading a bounded chunk beyond 4 GiB', async () => {
    const size = 12 * 1024 ** 3
    const first = await virtualFile('first.bin', size)
    await virtualFile('second.bin', size)
    expect((await scanP2pSource(directory)).source.totalSize).toBe(24 * 1024 ** 3)
    const store = new P2pSourceStore({ load: async () => [], save: async () => {} })
    await store.setAccount('user')
    try {
      const [source] = await store.importPaths([first])
      expect((await store.prepare(source.sourceId)).manifest.totalSize).toBe(size)
      const offset = 4 * 1024 ** 3 + 17
      expect(Buffer.from(await store.readChunk(source.sourceId, 0, offset, 3)).toString()).toBe('abc')
      expect(disk.reads).toEqual([offset])
      expect((await store.validate(source.sourceId)).totalSize).toBe(size)
      await expect(store.readChunk(source.sourceId, 0, size - 1, 3)).rejects.toThrow()
      await expect(store.readChunk(source.sourceId, 0, Number.MAX_SAFE_INTEGER, 3)).rejects.toThrow()
    } finally { await store.setAccount(null) }
  })

  it.each([-1, NaN, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid native sizes (%s)', async (size) => {
    const path = await virtualFile('invalid.bin', size)
    await expect(scanP2pSource(path)).rejects.toThrow(/大小无效/)
    const value = manifest(size)
    expect(() => validateReceiveManifest(value, { ...value, directoryCount: 0 })).toThrow()
  })

  it('rejects aggregate overflow during scanning and manifest validation', async () => {
    await virtualFile('first.bin', Number.MAX_SAFE_INTEGER)
    await virtualFile('second.bin', 1)
    await expect(scanP2pSource(directory)).rejects.toThrow(/可精确表示/)
    const value = manifest(Number.MAX_SAFE_INTEGER, 'folder')
    value.files.push({ ...value.files[0], index: 1, path: 'second.bin', name: 'second.bin', size: 1 })
    value.fileCount = 2
    value.manifestSha256 = manifestHash(value)
    expect(() => validateReceiveManifest(value, { ...value, directoryCount: 0 })).toThrow(/总大小无效/)
  })

  it.each(['file', 'folder'] as const)('validates a %s manifest larger than 20 GiB', (kind) => {
    const value = manifest(24 * 1024 ** 3, kind)
    expect(() => validateReceiveManifest(value, { ...value, directoryCount: 0 })).not.toThrow()
  })

  it('restores, writes and restores again past 4 GiB without truncating offsets to 32 bits', async () => {
    const offset = 4 * 1024 ** 3 + 17
    const prefix = Buffer.from('simulated checkpoint contents')
    const payload = Buffer.from('xyz')
    const temporaryPath = await virtualFile('.arttalk-abcd.part', offset, prefix)
    disk.files.get(temporaryPath)!.ranges.set(`0:${offset - 1}`, prefix)
    const value = manifest(offset + payload.length + 1)
    const task: NativeTask = { taskId: 'recv-large', receiveId: 'recv-large', transferId: 'p2p_large', direction: 'receive',
      status: 'paused', kind: 'file', name: value.name, conversationId: '1', messageId: '2',
      totalSize: value.totalSize, totalBytes: value.totalSize, fileCount: 1, directoryCount: 0,
      transferredBytes: offset, progress: 0, temporaryPath, localPath: join(directory, 'large.bin'),
      manifest: value, offsets: { 0: offset }, checkpoints: { 0: [{ offset, sha256: sha(prefix) }] }, verified: [] }
    let saved = structuredClone(task)
    const save = async (snapshot: NativeTask) => { saved = structuredClone(snapshot) }
    const receiver = new P2pReceiver(task, save)
    receivers.push(receiver)
    expect((await receiver.prepare(value)).offsets).toEqual({ 0: offset })
    expect(await receiver.write(0, offset, Uint8Array.from(payload).buffer)).toMatchObject({ offset: offset + payload.length })
    await receiver.suspend('manual')
    expect(saved.offsets).toEqual({ 0: offset + payload.length })
    expect(disk.writes).toEqual([offset])
    const restarted = new P2pReceiver(saved, save)
    receivers.push(restarted)
    expect((await restarted.prepare(value)).offsets).toEqual({ 0: offset + payload.length })
    expect(disk.truncates).toEqual([offset, offset + payload.length])
    expect(disk.streams).toContainEqual({ start: offset, end: offset + payload.length - 1 })
    await expect(restarted.write(0, offset, Uint8Array.from(payload).buffer)).rejects.toThrow()
  })
})
