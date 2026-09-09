import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const environment = vi.hoisted(() => ({ encryption: true, rejectRename: false, renameTargets: [] as string[] }))
vi.mock('electron', () => ({ safeStorage: {
  isEncryptionAvailable: () => environment.encryption,
  encryptString: (value: string) => Buffer.from('sealed:' + Buffer.from(value).toString('base64')),
  decryptString: (value: Buffer) => {
    if (!value.toString().startsWith('sealed:')) throw new Error('encrypted record corrupt')
    return Buffer.from(value.toString().slice(7), 'base64').toString()
  },
} }))
vi.mock('node:fs/promises', async (original) => {
  const real = await original<typeof import('node:fs/promises')>()
  return { ...real, rename: async (from: string, to: string) => {
    environment.renameTargets.push(to)
    if (environment.rejectRename) throw new Error('simulated atomic replace failure')
    return real.rename(from, to)
  } }
})

import { mergeRendererTaskPatch, P2pTaskStorage, type NativeP2pManifest, type NativeTaskPatch } from './p2pTaskStorage'

const manifest: NativeP2pManifest = {
  version: 2, kind: 'folder', name: '私密资料', totalSize: 3, fileCount: 1, directories: ['empty'],
  files: [{ index: 0, path: 'secret.txt', name: 'secret.txt', size: 3, contentType: 'text/plain', sha256: 'a'.repeat(64) }],
  manifestSha256: 'b'.repeat(64),
}
const task = (id = 'one'): NativeTaskPatch => ({ taskId: id, transferId: `p2p_${id}`, direction: 'receive', status: 'receiving', name: '私密资料', kind: 'folder', conversationId: 'chat-1', totalSize: 3, totalBytes: 3, fileCount: 1, directoryCount: 1 })

describe('encrypted P2P task storage', () => {
  let directory: string
  let storage: P2pTaskStorage
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'arttalk-p2p-tasks-test-'))
    storage = new P2pTaskStorage(directory)
    environment.encryption = true
    environment.rejectRename = false
    environment.renameTargets = []
    await storage.load('account-a')
  })
  afterEach(async () => {
    await storage.flush()
    const absolute = resolve(directory)
    if (dirname(absolute).toLowerCase() !== resolve(tmpdir()).toLowerCase() || !basename(absolute).startsWith('arttalk-p2p-tasks-test-')) throw new Error('Unsafe test cleanup')
    await rm(absolute, { recursive: true, force: true })
  })
  async function accountDirectory() {
    const accounts = await readdir(join(directory, 'p2p-tasks-v2'))
    return join(directory, 'p2p-tasks-v2', accounts[0])
  }

  it('reloads manifests and durable checkpoints while keeping account files encrypted and separate', async () => {
    await storage.upsert('account-a', { ...task(), manifest, temporaryPath: 'C:\\private\\part', offsets: { 0: 3 }, checkpoints: { 0: [{ offset: 3, sha256: 'c'.repeat(64) }] }, verified: [0], pendingControls: [{ cmd: 'P2P_SHARE_STOP', data: { transferId: 'p2p_one' } }] })
    const root = await accountDirectory()
    const encrypted = await readFile(join(root, 'tasks.enc'), 'utf8')
    expect(encrypted).not.toContain('私密资料')
    expect(encrypted).not.toContain('C:\\private')
    const restored = new P2pTaskStorage(directory)
    expect((await restored.load('account-a'))[0]).toMatchObject({ manifest, offsets: { 0: 3 }, verified: [0], pendingControls: [{ cmd: 'P2P_SHARE_STOP' }] })
    expect(await restored.load('account-b')).toEqual([])
    await restored.upsert('account-b', { ...task('other'), name: '另一账号' })
    expect((await restored.load('account-a')).map((entry) => entry.name)).toEqual(['私密资料'])
  })

  it('serializes concurrent changes, keeps every task beyond 200, and deletes only the requested task', async () => {
    await Promise.all(Array.from({ length: 205 }, (_, index) => storage.upsert('account-a', task(String(index)))))
    expect(await storage.load('account-a')).toHaveLength(205)
    await Promise.all([
      storage.upsert('account-a', { taskId: '0', status: 'paused' }),
      storage.upsert('account-a', { taskId: '0', error: 'waiting for manual resume' }),
    ])
    expect((await storage.load('account-a')).find((entry) => entry.taskId === '0')).toMatchObject({ status: 'paused', error: 'waiting for manual resume' })
    expect(await storage.delete('account-a', '1')).toBe(true)
    expect(await storage.load('account-a')).toHaveLength(204)
    expect(await storage.delete('account-a', 'missing')).toBe(false)
  })

  it('stores a large manifest separately and does not rewrite it for checkpoints', async () => {
    await storage.upsert('account-a', { ...task(), manifest })
    const root = await accountDirectory()
    const names = await readdir(root)
    const manifestFile = names.find((name) => name.endsWith('.manifest.enc'))!
    const originalBytes = await readFile(join(root, manifestFile))
    const manifestWrites = environment.renameTargets.filter((name) => name.endsWith('.manifest.enc')).length
    const originalIndex = JSON.parse(Buffer.from((await readFile(join(root, 'tasks.enc'), 'utf8')).slice(7), 'base64').toString())
    expect(originalIndex.tasks.one.manifest).toBeUndefined()
    expect(originalIndex.tasks.one.manifestRef).toBeTruthy()
    await storage.upsert('account-a', { taskId: 'one', offsets: { 0: 3 }, manifest })
    expect(await readFile(join(root, manifestFile))).toEqual(originalBytes)
    expect((await readdir(root)).filter((name) => name.endsWith('.manifest.enc'))).toHaveLength(1)
    expect(environment.renameTargets.filter((name) => name.endsWith('.manifest.enc'))).toHaveLength(manifestWrites)
    expect((await storage.load('account-a'))[0].manifest).toEqual(manifest)
  })

  it('rejects queued old-account writes after an account switch', async () => {
    const pending = storage.upsert('account-a', task())
    const rejected = expect(pending).rejects.toThrow('账号已切换')
    const other = storage.load('account-b')
    await rejected
    expect(await other).toEqual([])
    expect(await storage.load('account-a')).toEqual([])
    storage.setAccount(null)
    await expect(storage.upsert('account-a', task())).rejects.toThrow('账号已切换')
  })

  it('preserves the previous atomic file and removes staging files when replace fails', async () => {
    await storage.upsert('account-a', task())
    const root = await accountDirectory()
    const before = await readFile(join(root, 'tasks.enc'))
    environment.rejectRename = true
    await expect(storage.upsert('account-a', { taskId: 'one', status: 'completed' })).rejects.toThrow('atomic replace failure')
    expect(await readFile(join(root, 'tasks.enc'))).toEqual(before)
    expect((await readdir(root)).some((name) => name.endsWith('.tmp'))).toBe(false)
    expect((await storage.load('account-a'))[0].status).toBe('receiving')
    environment.rejectRename = false
    await storage.upsert('account-a', { taskId: 'one', status: 'paused' })
    expect((await storage.load('account-a'))[0].status).toBe('paused')
  })

  it('does not fall back to plaintext or overwrite corrupt encrypted files', async () => {
    environment.encryption = false
    await expect(storage.upsert('account-a', task())).rejects.toThrow('安全存储')
    environment.encryption = true
    await storage.upsert('account-a', task())
    const root = await accountDirectory()
    await writeFile(join(root, 'tasks.enc'), 'corrupt')
    const restored = new P2pTaskStorage(directory)
    await expect(restored.load('account-a')).rejects.toThrow('corrupt')
    await expect(restored.upsert('account-a', task('new'))).rejects.toThrow('corrupt')
    expect(await readFile(join(root, 'tasks.enc'), 'utf8')).toBe('corrupt')
  })

  it('refuses a missing manifest rather than silently losing recovery information', async () => {
    await storage.upsert('account-a', { ...task(), manifest })
    const root = await accountDirectory()
    const filename = (await readdir(root)).find((name) => name.endsWith('.manifest.enc'))!
    await rm(join(root, filename))
    await expect(new P2pTaskStorage(directory).load('account-a')).rejects.toThrow('清单缺失或损坏')
  })

  it('keeps renderer control updates away from native paths and checkpoint truth', async () => {
    const record = await storage.upsert('account-a', { ...task(), manifest, prepared: true, temporaryPath: 'authorized.part', offsets: { 0: 1 }, verified: [] })
    const merged = mergeRendererTaskPatch(record, { status: 'completed', desiredState: 'paused', temporaryPath: 'unrelated', offsets: { 0: 999 }, verified: [0], manifest: { ...manifest, totalSize: 999 } })
    expect(merged.status).toBe('receiving')
    expect(merged.desiredState).toBe('paused')
    expect(merged.temporaryPath).toBe('authorized.part')
    expect(merged.offsets).toEqual({ 0: 1 })
    expect(merged.verified).toEqual([])
    expect(merged.manifest).toEqual(manifest)
  })

  it('keeps a native cancellation durable when a late renderer progress save arrives', async () => {
    await storage.upsert('account-a', { ...task(), offsets: { 0: 1 } })
    const cancelled = await storage.upsert('account-a', { taskId: 'one', status: 'cancelled', offsets: {}, cleanupPending: true, cleanupError: '原保存磁盘离线' })
    const lateProgress = mergeRendererTaskPatch(cancelled, { status: 'receiving', phase: 'receiving', desiredState: 'running', transferredBytes: 3, offsets: { 0: 3 }, error: undefined, cleanupPending: false, cleanupError: undefined })
    await storage.upsert('account-a', lateProgress)
    const restored = (await new P2pTaskStorage(directory).load('account-a'))[0]
    expect(restored).toMatchObject({ status: 'cancelled', transferredBytes: 0, offsets: {}, cleanupPending: true, cleanupError: '原保存磁盘离线', error: '原保存磁盘离线' })
    expect(cancelled.status).toBe('cancelled')
  })

  it('preserves native completion across late progress, pause, cancellation and recall patches', async () => {
    const completed = await storage.upsert('account-a', { ...task(), status: 'completed', progress: 1, transferredBytes: 3, localPath: 'verified-result', verified: [0] })
    for (const status of ['receiving', 'paused', 'cancelled', 'recalled']) {
      const merged = mergeRendererTaskPatch(completed, { status, progress: 0, transferredBytes: 0, localPath: 'stale-location', verified: [], shareState: status === 'recalled' ? 'RECALLED' : 'ACTIVE' })
      expect(merged).toMatchObject({ status: 'completed', progress: 1, transferredBytes: 3, localPath: 'verified-result', verified: [0] })
      expect(merged.shareState).toBe(status === 'recalled' ? 'RECALLED' : 'ACTIVE')
    }
  })

  it('retains terminal share updates and cleanup guidance until native cleanup clears the record', async () => {
    const cancelled = await storage.upsert('account-a', { ...task(), status: 'cancelled', cleanupPending: true })
    const recalled = mergeRendererTaskPatch(cancelled, { status: 'recalled', shareState: 'RECALLED', cleanupPending: false, cleanupError: '', error: '' })
    expect(recalled.status).toBe('recalled')
    expect(recalled.cleanupPending).toBe(true)
    expect(recalled.error).toContain('重试清理')
    const cleaned = await storage.upsert('account-a', { ...recalled, cleanupPending: false, cleanupError: undefined, error: undefined })
    expect(mergeRendererTaskPatch(cleaned, { error: undefined }).error).toBeUndefined()
    const sender = await storage.upsert('account-a', { ...task('sender'), direction: 'send', status: 'completed' })
    expect(mergeRendererTaskPatch(sender, { status: 'paused' }).status).toBe('paused')
  })

  it('clears obsolete route and error fields rather than restoring them on the next launch', async () => {
    await storage.upsert('account-a', { ...task(), routeId: 'old-route', error: 'old-error' })
    await storage.upsert('account-a', { taskId: 'one', routeId: undefined, error: undefined, status: 'paused' })
    const restored = (await new P2pTaskStorage(directory).load('account-a'))[0]
    expect(restored.routeId).toBeUndefined()
    expect(restored.error).toBeUndefined()
  })

  it('persists native source grants separately and isolates them on account changes', async () => {
    const sources = [{ source: { sourceId: 'src_one', kind: 'folder' as const, name: '私密目录', totalSize: 0, fileCount: 0, directoryCount: 1 }, rootPath: 'C:\\private-source', files: [], directories: ['empty'] }]
    await storage.saveSources('account-a', sources)
    const root = await accountDirectory()
    expect(await readFile(join(root, 'sources.enc'), 'utf8')).not.toContain('private-source')
    const restored = new P2pTaskStorage(directory)
    await restored.load('account-a')
    expect(await restored.loadSources('account-a')).toEqual(sources)
    await restored.load('account-b')
    expect(await restored.loadSources('account-b')).toEqual([])
    await expect(restored.saveSources('account-a', sources)).rejects.toThrow('账号已切换')
  })
})
