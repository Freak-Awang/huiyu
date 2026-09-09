import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { P2pSourceStore, scanP2pSource, type P2pSourceRecord } from './p2pSources'

describe('native P2P sources', () => {
  let directory: string
  let persisted: Map<string, P2pSourceRecord[]>
  let store: P2pSourceStore
  let progress: ReturnType<typeof vi.fn>
  const setup = () => new P2pSourceStore({
    load: async (userId) => structuredClone(persisted.get(userId) || []),
    save: async (userId, records) => { persisted.set(userId, structuredClone(records)) },
    onProgress: progress,
  })

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'arttalk-p2p-source-test-'))
    persisted = new Map()
    progress = vi.fn()
    store = setup()
    await store.setAccount('user-1')
  })

  afterEach(async () => {
    await store.setAccount(null)
    await rm(directory, { recursive: true, force: true })
  })

  it('scans zero-byte files and every empty/nested directory deterministically', async () => {
    await mkdir(join(directory, 'empty'))
    await mkdir(join(directory, 'nested', 'also-empty'), { recursive: true })
    await writeFile(join(directory, 'zero.txt'), '')
    await writeFile(join(directory, 'nested', 'data.txt'), 'hello')
    const [source] = await store.importPaths([directory])
    expect(source).toMatchObject({ kind: 'folder', totalSize: 5, fileCount: 2, directoryCount: 3 })
    const { manifest } = await store.prepare(source!.sourceId)
    expect(manifest.directories).toEqual(['empty', 'nested', 'nested/also-empty'])
    expect(manifest.files.map((file) => file.path)).toEqual(['nested/data.txt', 'zero.txt'])
    expect(manifest.files[1]!.sha256).toBe(createHash('sha256').digest('hex'))
    expect(manifest.files[0]!.sha256).toBe(createHash('sha256').update('hello').digest('hex'))
  })

  it('creates a manifest for an entirely empty root folder', async () => {
    const [source] = await store.importPaths([directory])
    const { manifest } = await store.prepare(source!.sourceId)
    expect(manifest).toMatchObject({ version: 2, totalSize: 0, fileCount: 0, directories: [], files: [] })
    expect(manifest.manifestSha256).toHaveLength(64)
  })

  it('uses the exact canonical manifest JSON field order', async () => {
    await writeFile(join(directory, 'one.bin'), 'abc')
    const [source] = await store.importPaths([join(directory, 'one.bin')])
    const { manifest } = await store.prepare(source!.sourceId)
    const expected = JSON.stringify({ version: 2, kind: 'file', name: 'one.bin', totalSize: 3,
      fileCount: 1, directories: [], files: [{ index: 0, path: 'one.bin', name: 'one.bin', size: 3,
        contentType: 'application/octet-stream', sha256: createHash('sha256').update('abc').digest('hex') }] })
    expect(manifest.manifestSha256).toBe(createHash('sha256').update(expected).digest('hex'))
  })

  it('rejects an entire selection batch when any selected path fails', async () => {
    const good = join(directory, 'good.txt')
    await writeFile(good, 'hello')
    await expect(store.importPaths([good, join(directory, 'missing')])).rejects.toThrow()
    expect(persisted.get('user-1')).toBeUndefined()
    await expect(store.importPaths(['relative/path'])).rejects.toThrow()
  })

  it('rejects links instead of omitting them from the folder', async () => {
    const target = join(directory, 'target')
    await mkdir(target)
    const folder = join(directory, 'selected')
    await mkdir(folder)
    await symlink(target, join(folder, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(scanP2pSource(folder)).rejects.toThrow(/链接/)
  })

  it('rejects normalization collisions and unsafe names', async () => {
    // Trailing-dot/space names cannot be created reliably on Windows; test NFC aliases instead.
    await writeFile(join(directory, '\u00e9.txt'), 'a')
    await writeFile(join(directory, 'e\u0301.txt'), 'b')
    await expect(scanP2pSource(directory)).rejects.toThrow(/冲突/)
  })

  it('reads only prepared, bounded chunks from the selected source', async () => {
    const file = join(directory, 'one.bin')
    await writeFile(file, 'abcdef')
    const [source] = await store.importPaths([file])
    await expect(store.readChunk(source!.sourceId, 0, 0, 1)).rejects.toThrow()
    await store.prepare(source!.sourceId)
    expect(Buffer.from(await store.readChunk(source!.sourceId, 0, 2, 3)).toString()).toBe('cde')
    for (const args of [[-1, 0, 1], [0, -1, 1], [0, 0, 0], [0, 0, 65_537], [0, 5, 2]]) {
      await expect(store.readChunk(source!.sourceId, args[0]!, args[1]!, args[2]!)).rejects.toThrow()
    }
    await expect(store.readChunk('../one.bin', 0, 0, 1)).rejects.toThrow()
  })

  it('detects changes during later reads and preserves the frozen manifest on preparation failure', async () => {
    const file = join(directory, 'one.bin')
    await writeFile(file, 'before')
    const [source] = await store.importPaths([file])
    const original = await store.prepare(source!.sourceId)
    await writeFile(file, 'after')
    await expect(store.readChunk(source!.sourceId, 0, 0, 1)).rejects.toThrow(/修改/)
    await expect(store.validate(source!.sourceId)).rejects.toThrow(/变化/)
    await expect(store.prepare(source!.sourceId)).rejects.toThrow(/重新选择/)
    expect(store.get(source!.sourceId).manifest).toEqual(original.manifest)
    expect(persisted.get('user-1')![0]!.manifest).toEqual(original.manifest)
    const backup = join(directory, 'original-backup.bin')
    await writeFile(backup, 'before')
    expect((await store.locate(source!.sourceId, backup)).manifest).toEqual(original.manifest)
    expect(Buffer.from(await store.readChunk(source!.sourceId, 0, 0, 6)).toString()).toBe('before')
  })

  it('detects extra files before allowing reuse of a cached folder manifest', async () => {
    const [source] = await store.importPaths([directory])
    await store.prepare(source!.sourceId)
    await writeFile(join(directory, 'added'), '')
    await expect(store.prepare(source!.sourceId)).rejects.toThrow(/目录结构已改变/)
    expect(store.get(source!.sourceId).manifest!.fileCount).toBe(0)
  })

  it('refreshes source fingerprints for identical content without changing its manifest', async () => {
    const file = join(directory, 'one.bin')
    await writeFile(file, 'same')
    const [source] = await store.importPaths([file])
    const original = await store.prepare(source!.sourceId)
    await rm(file)
    await writeFile(file, 'same')
    const refreshed = await store.prepare(source!.sourceId)
    expect(refreshed.manifest).toEqual(original.manifest)
    expect(Buffer.from(await store.readChunk(source!.sourceId, 0, 0, 4)).toString()).toBe('same')
  })

  it('keeps the original manifest when locating a renamed identical file, also after restart', async () => {
    const file = join(directory, 'original.txt')
    await writeFile(file, 'same content')
    const [source] = await store.importPaths([file])
    const first = await store.prepare(source!.sourceId)
    const moved = join(directory, 'renamed.dat')
    await rename(file, moved)
    const located = await store.locate(source!.sourceId, moved)
    expect(located.manifest).toEqual(first.manifest)
    const restarted = setup()
    await restarted.setAccount('user-1')
    const restored = await restarted.prepare(source!.sourceId)
    expect(restored.manifest).toEqual(first.manifest)
    expect(Buffer.from(await restarted.readChunk(source!.sourceId, 0, 0, 4)).toString()).toBe('same')
    await restarted.setAccount(null)
  })

  it('rejects locating different content and preserves the old source registration', async () => {
    const file = join(directory, 'original.txt')
    await writeFile(file, 'original')
    const [source] = await store.importPaths([file])
    await store.prepare(source!.sourceId)
    const wrong = join(directory, 'wrong.txt')
    await writeFile(wrong, 'different')
    await expect(store.locate(source!.sourceId, wrong)).rejects.toThrow(/不一致/)
    expect(store.get(source!.sourceId).rootPath).toBe(file)
  })

  it('isolates account paths and refuses preparation after logout', async () => {
    await writeFile(join(directory, 'one'), 'one')
    const [source] = await store.importPaths([join(directory, 'one')])
    await store.setAccount('user-2')
    expect(() => store.get(source!.sourceId)).toThrow()
    await store.setAccount('user-1')
    expect(store.get(source!.sourceId).source).toEqual(source)
    await store.setAccount(null)
    await expect(store.prepare(source!.sourceId)).rejects.toThrow(/登录/)
  })

  it('cancels hashing without persisting a half-prepared manifest', async () => {
    const file = join(directory, 'cancel.bin')
    await writeFile(file, Buffer.alloc(2 * 1024 * 1024))
    const [source] = await store.importPaths([file])
    progress.mockImplementation((value) => {
      if (value.phase === 'hashing') store.cancel(source!.sourceId)
    })
    await expect(store.prepare(source!.sourceId)).rejects.toMatchObject({ name: 'AbortError' })
    expect(store.get(source!.sourceId).manifest).toBeUndefined()
    progress.mockReset()
    expect((await store.prepare(source!.sourceId)).manifest.totalSize).toBe(2 * 1024 * 1024)
  })

  it('propagates durable storage errors instead of retaining an unpersisted source', async () => {
    const fail = new P2pSourceStore({ load: async () => [], save: async () => { throw new Error('disk full') } })
    await fail.setAccount('user-1')
    await expect(fail.importPaths([directory])).rejects.toThrow('disk full')
    expect(await readFile(join(directory, 'never-written')).catch(() => null)).toBeNull()
  })
})
