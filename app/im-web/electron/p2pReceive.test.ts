import { createHash, randomUUID } from 'node:crypto'
import { cp, mkdtemp, mkdir, readFile, rename, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { P2pReceiver, checkDestination, manifestHash, verifyResult, type ReceiveManifest } from './p2pReceive'
import type { NativeTask } from './p2pTaskStorage'

const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
const bytes = (value: Buffer | string) => Uint8Array.from(Buffer.from(value)).buffer

describe('native P2P receive lifecycle', () => {
  let directory: string
  let snapshots: NativeTask[]
  let receivers: P2pReceiver[]

  function fixture(files: Array<{ path: string; data: Buffer | string }>, directories: string[] = [], kind: 'file' | 'folder' = 'file') {
    const manifest: ReceiveManifest = {
      version: 2, kind, name: kind === 'file' ? files[0]!.path : 'folder',
      totalSize: files.reduce((sum, file) => sum + Buffer.byteLength(file.data), 0), fileCount: files.length,
      directories, files: files.map((file, index) => ({ index, path: file.path, name: file.path.split('/').pop()!,
        size: Buffer.byteLength(file.data), contentType: 'application/octet-stream', sha256: sha(file.data) })), manifestSha256: '',
    }
    manifest.manifestSha256 = manifestHash(manifest)
    const task: NativeTask = {
      taskId: `recv_${randomUUID()}`, receiveId: 'receive-1', transferId: 'p2p_example', messageId: 'm1', conversationId: 'c1',
      direction: 'receive', status: 'connecting', name: manifest.name, kind, fileCount: files.length,
      directoryCount: directories.length, totalSize: manifest.totalSize, totalBytes: manifest.totalSize,
      transferredBytes: 0, progress: 0, desiredState: 'running',
      temporaryPath: join(directory, `.arttalk-${randomUUID()}.part`), localPath: join(directory, `result-${randomUUID()}`),
    }
    const receiver = makeReceiver(task)
    return { receiver, task, manifest }
  }

  function makeReceiver(task: NativeTask, save?: (task: NativeTask) => Promise<unknown>) {
    const receiver = new P2pReceiver(task, save || (async (value) => { snapshots.push(structuredClone(value)) }))
    receivers.push(receiver)
    return receiver
  }

  async function writeAll(receiver: P2pReceiver, index: number, value: Buffer | string, start = 0) {
    const data = Buffer.from(value)
    for (let offset = start; offset < data.length; offset += 64 * 1024) {
      await receiver.write(index, offset, bytes(data.subarray(offset, Math.min(data.length, offset + 64 * 1024))))
    }
  }

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'arttalk-p2p-receive-test-'))
    snapshots = []; receivers = []
  })

  afterEach(async () => {
    for (const receiver of receivers) await receiver.suspend('manual').catch(() => undefined)
    await rm(directory, { recursive: true, force: true })
  })

  it('receives, verifies and commits a zero-byte file', async () => {
    const { receiver, manifest, task } = fixture([{ path: 'empty.txt', data: '' }])
    await receiver.prepare(manifest)
    expect(await receiver.finish(0)).toMatchObject({ success: true, offset: 0, sha256: sha('') })
    const result = await receiver.commit()
    expect((await stat(result.path)).size).toBe(0)
    expect(task.status).toBe('completed')
  })

  it('preserves an empty folder and nested empty directories', async () => {
    const { receiver, manifest } = fixture([], ['empty', 'nested', 'nested/empty'], 'folder')
    await receiver.prepare(manifest)
    const result = await receiver.commit()
    expect((await stat(join(result.path, 'nested', 'empty'))).isDirectory()).toBe(true)
    expect(await verifyResult(receiver.task, result.path)).toBe(true)
  })

  it('reports monotonically increasing operation sequences for empty directory preparation and verification', async () => {
    const { manifest, task } = fixture([], ['empty', 'nested', 'nested/empty'], 'folder')
    const events: Array<{ processedBytes: number; sequence?: number }> = []
    const receiver = new P2pReceiver(task, async () => undefined, (event) => { events.push(event) })
    receivers.push(receiver)
    await receiver.prepare(manifest)
    expect(events.length).toBeGreaterThanOrEqual(4)
    const afterPrepare = events.length
    await receiver.commit()
    expect(events.length).toBeGreaterThan(afterPrepare)
    expect(events.every((event) => event.processedBytes === 0)).toBe(true)
    expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index + 1))
  })

  it('checks durable hashes on restart and discards an unchecked tail', async () => {
    const data = Buffer.alloc(4 * 1024 * 1024 + 64 * 1024, 0x31)
    const { receiver, manifest } = fixture([{ path: 'large.bin', data }])
    await receiver.prepare(manifest)
    await writeAll(receiver, 0, data.subarray(0, 4 * 1024 * 1024))
    const durable = structuredClone(snapshots.at(-1)!)
    await writeFile(durable.temporaryPath!, Buffer.alloc(12, 0x7a), { flag: 'a' })
    const restarted = makeReceiver(durable)
    const restored = await restarted.restore()
    expect(restored.offsets[0]).toBe(4 * 1024 * 1024)
    expect((await stat(durable.temporaryPath!)).size).toBe(4 * 1024 * 1024)
    await writeAll(restarted, 0, data, 4 * 1024 * 1024)
    await restarted.finish(0)
  })

  it('reports real checkpoint hash progress while restoring an unfinished large file', async () => {
    const data = Buffer.alloc(4 * 1024 * 1024 + 64 * 1024, 0x42)
    const { receiver, manifest } = fixture([{ path: 'resuming.bin', data }])
    await receiver.prepare(manifest)
    await writeAll(receiver, 0, data.subarray(0, 4 * 1024 * 1024)); await receiver.suspend('manual')
    const progress: Array<{ phase: string; processedBytes: number; totalBytes: number }> = []
    const restarted = new P2pReceiver(structuredClone(receiver.task), async () => undefined, (event) => { progress.push(event) })
    receivers.push(restarted)
    await restarted.restore()
    expect(progress[0]).toMatchObject({ phase: 'verifying', processedBytes: 0, totalBytes: data.length })
    expect(progress.some((event) => event.processedBytes === 4 * 1024 * 1024)).toBe(true)
    expect(restarted.task.offsets?.[0]).toBe(4 * 1024 * 1024)
  })

  it('retains already verified sibling files when a file checksum fails', async () => {
    const { receiver, manifest } = fixture([{ path: 'good', data: 'good' }, { path: 'bad', data: 'wanted' }], [], 'folder')
    await receiver.prepare(manifest)
    await writeAll(receiver, 0, 'good'); await receiver.finish(0)
    await writeAll(receiver, 1, 'broken')
    await expect(receiver.finish(1)).rejects.toThrow(/仅重传此文件/)
    expect(receiver.task.verified).toEqual([0])
    expect(receiver.task.offsets).toMatchObject({ 0: 4, 1: 0 })
    await receiver.suspend('manual')
    const restarted = makeReceiver(structuredClone(receiver.task))
    const restored = await restarted.restore()
    expect(restored.offsets).toMatchObject({ 0: 4, 1: 0 })
    await writeAll(restarted, 1, 'wanted'); await restarted.finish(1)
    const result = await restarted.commit()
    expect((await readFile(join(result.path, 'good'))).toString()).toBe('good')
  })

  it('rolls a corrupt checkpoint back while preserving unrelated file progress', async () => {
    const { receiver, manifest } = fixture([{ path: 'one', data: 'correct' }, { path: 'two', data: 'intact' }], [], 'folder')
    await receiver.prepare(manifest)
    await writeAll(receiver, 0, 'correct'); await writeAll(receiver, 1, 'intact')
    await receiver.suspend('manual')
    await writeFile(join(receiver.task.temporaryPath!, 'one'), 'corrupt')
    const restarted = makeReceiver(structuredClone(receiver.task))
    const result = await restarted.restore()
    expect(result.offsets).toEqual({ 0: 0, 1: 6 })
  })

  it('persists the final partial checkpoint when paused and does not accept late writes', async () => {
    const { receiver, manifest } = fixture([{ path: 'partial', data: 'abcdef' }])
    await receiver.prepare(manifest)
    expect(await receiver.write(0, 0, bytes('abc'))).toMatchObject({ offset: 3, durableOffset: 0 })
    await receiver.suspend('manual')
    expect(receiver.task.offsets?.[0]).toBe(3)
    await expect(receiver.write(0, 3, bytes('def'))).rejects.toThrow(/暂停/)
    expect(receiver.task.status).toBe('paused')
  })

  it('persists a paused task and releases handles when the receive volume fails during flush', async () => {
    const { receiver, manifest } = fixture([{ path: 'disconnecting-drive', data: 'abcdef' }])
    await receiver.prepare(manifest); await receiver.write(0, 0, bytes('abc'))
    const handles = (receiver as unknown as { handles: Map<number, { sync: () => Promise<void> }> }).handles
    handles.get(0)!.sync = async () => { throw Object.assign(new Error('receive volume offline'), { code: 'EIO' }) }
    expect(await receiver.suspend('restart')).toBe(true)
    expect(handles.size).toBe(0)
    expect(receiver.task.status).toBe('paused')
    expect(receiver.task.error).toMatch(/保存位置暂不可用/)
    expect(snapshots.at(-1)?.status).toBe('paused')
    expect(receiver.task.offsets?.[0] || 0).toBe(0)
    await expect(receiver.write(0, 3, bytes('def'))).rejects.toThrow(/暂停/)
  })

  it('prevents queued preparation or commit from undoing pause and cancel', async () => {
    const first = fixture([{ path: 'late', data: '' }])
    const preparation = first.receiver.prepare(first.manifest)
    const abort = first.receiver.abort()
    await expect(preparation).rejects.toThrow(/状态已改变/)
    await abort
    expect(first.task.status).toBe('cancelled')
    await expect(first.receiver.restore()).rejects.toThrow(/终止/)
    const second = fixture([{ path: 'done', data: '' }])
    await second.receiver.prepare(second.manifest); await second.receiver.finish(0)
    const pause = second.receiver.suspend('manual')
    await expect(second.receiver.commit()).rejects.toThrow(/暂停/)
    await pause
    await expect(stat(second.task.localPath!)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('reconciles rename success after a crash even if startup changed the status to paused', async () => {
    const { task, manifest } = fixture([{ path: 'committed', data: 'data' }])
    let durable!: NativeTask
    const receiver = makeReceiver(task, async (value) => {
      if (value.status === 'completed') throw new Error('simulated crash before completed record')
      durable = structuredClone(value)
    })
    await receiver.prepare(manifest); await writeAll(receiver, 0, 'data'); await receiver.finish(0)
    await expect(receiver.commit()).rejects.toThrow('simulated crash')
    durable.status = 'paused'; durable.pauseReason = 'manual'
    const restarted = makeReceiver(durable)
    expect(await restarted.reconcile()).toEqual({ completed: true })
    expect(restarted.task.status).toBe('completed')
    expect((await readFile(restarted.task.localPath!)).toString()).toBe('data')
  })

  it('does not resume or create temporary files during ordinary startup reconciliation', async () => {
    const { receiver, task } = fixture([{ path: 'waiting', data: 'x' }])
    task.status = 'paused'; task.pauseReason = 'manual'
    expect(await receiver.reconcile()).toEqual({ completed: false })
    await expect(stat(task.temporaryPath!)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(task.status).toBe('paused')
  })

  it('returns completed on restore and refuses a duplicate manifest after a lost completion ACK', async () => {
    const { receiver, manifest, task } = fixture([{ path: 'complete', data: 'saved' }])
    await receiver.prepare(manifest); await writeAll(receiver, 0, 'saved'); await receiver.finish(0)
    const result = await receiver.commit()
    const restarted = makeReceiver(structuredClone(task))
    expect(await restarted.restore()).toMatchObject({ success: true, completed: true, status: 'completed', finalPath: result.path })
    await expect(restarted.prepare(manifest)).rejects.toThrow(/任务已结束/)
    await expect(stat(task.temporaryPath!)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await readFile(result.path)).toString()).toBe('saved')
    expect(restarted.task.status).toBe('completed')
  })

  it.each(['cancelled', 'stopped', 'recalled'])('does not reopen a persisted %s receive task', async (status) => {
    const { receiver, manifest, task } = fixture([{ path: 'terminal', data: 'x' }])
    task.status = status
    await expect(receiver.prepare(manifest)).rejects.toThrow(/任务已结束/)
    await expect(stat(task.temporaryPath!)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(task.status).toBe(status)
  })

  it('rejects a symlink or junction ancestor before writing any destination files', async () => {
    const outside = join(directory, 'outside')
    await mkdir(outside)
    const link = join(directory, 'linked')
    await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
    await expect(checkDestination(join(link, 'child'), 0)).rejects.toThrow(/链接/)
    await expect(stat(join(outside, 'child'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses a replaced temporary folder parent and protects files beyond it', async () => {
    const outside = join(directory, 'outside')
    await mkdir(outside); await writeFile(join(outside, 'sentinel'), 'keep')
    const { receiver, manifest, task } = fixture([{ path: 'nested/one', data: 'abc' }], ['nested'], 'folder')
    await receiver.prepare(manifest); await receiver.suspend('manual')
    const nested = join(task.temporaryPath!, 'nested')
    await rm(nested, { recursive: true })
    await symlink(outside, nested, process.platform === 'win32' ? 'junction' : 'dir')
    await expect(receiver.restore()).rejects.toThrow(/链接/)
    expect((await readFile(join(outside, 'sentinel'))).toString()).toBe('keep')
  })

  it('will not recursively remove a user folder disguised as a temporary receive path', async () => {
    const { receiver, task } = fixture([], [], 'folder')
    task.temporaryPath = join(directory, 'user-data')
    await mkdir(task.temporaryPath); await writeFile(join(task.temporaryPath, 'keep'), 'safe')
    expect(await receiver.abort()).toBe(true)
    expect(receiver.task.status).toBe('cancelled')
    expect(receiver.task.cleanupPending).toBe(true)
    expect(receiver.task.cleanupError).toMatch(/路径校验/)
    expect((await readFile(join(task.temporaryPath, 'keep'))).toString()).toBe('safe')
  })

  it('persists cancellation when the original destination disappears and retries safe cleanup later', async () => {
    const { receiver, manifest, task } = fixture([{ path: 'offline', data: 'abcdef' }])
    const parent = join(directory, 'offline-parent')
    await mkdir(parent)
    task.localPath = join(parent, 'result')
    task.temporaryPath = join(parent, `.arttalk-${randomUUID()}.part`)
    await receiver.prepare(manifest); await receiver.write(0, 0, bytes('abc')); await receiver.suspend('manual')
    await rm(parent, { recursive: true })
    expect(await receiver.abort()).toBe(true)
    expect(receiver.task.status).toBe('cancelled')
    expect(receiver.task.cleanupPending).toBe(true)
    expect(receiver.task.cleanupError).toMatch(/传输已取消/)
    expect(snapshots.at(-1)?.status).toBe('cancelled')
    await expect(receiver.restore()).rejects.toThrow(/终止/)
    const restarted = makeReceiver(structuredClone(receiver.task))
    await expect(restarted.restore()).rejects.toThrow(/终止/)
    await mkdir(parent)
    expect(await restarted.retryCleanup()).toMatchObject({ success: true, cleanupPending: false })
    expect(restarted.task.status).toBe('cancelled')
  })

  it('cancels logically without deleting through a maliciously replaced parent', async () => {
    const { receiver, manifest, task } = fixture([{ path: 'one', data: 'abc' }])
    const parent = join(directory, 'original-parent')
    const backup = join(directory, 'original-backup')
    const outside = join(directory, 'outside')
    await mkdir(parent); await mkdir(outside)
    const temporaryName = `.arttalk-${randomUUID()}.part`
    task.localPath = join(parent, 'result'); task.temporaryPath = join(parent, temporaryName)
    await receiver.prepare(manifest); await receiver.suspend('manual')
    await rename(parent, backup)
    await writeFile(join(outside, temporaryName), 'keep outside data')
    await symlink(outside, parent, process.platform === 'win32' ? 'junction' : 'dir')
    expect(await receiver.abort()).toBe(true)
    expect(receiver.task).toMatchObject({ status: 'cancelled', cleanupPending: true })
    expect((await readFile(join(outside, temporaryName))).toString()).toBe('keep outside data')
    await expect(receiver.prepare(manifest)).rejects.toThrow(/取消/)
    await rm(parent); await rename(backup, parent)
    expect(await receiver.retryCleanup()).toMatchObject({ success: true, cleanupPending: false })
    await expect(stat(task.temporaryPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await readFile(join(outside, temporaryName))).toString()).toBe('keep outside data')
  })

  it('allows a missing old temporary directory to start from zero at a new safe destination', async () => {
    const { receiver, manifest, task } = fixture([{ path: 'one', data: 'abcdef' }])
    const parent = join(directory, 'missing-parent')
    await mkdir(parent)
    task.localPath = join(parent, 'result'); task.temporaryPath = join(parent, `.arttalk-${randomUUID()}.part`)
    await receiver.prepare(manifest); await receiver.write(0, 0, bytes('abc')); await receiver.suspend('manual')
    await rm(parent, { recursive: true })
    const destination = join(directory, 'new-parent', 'result')
    expect(await receiver.changeDestination(destination)).toMatchObject({ success: true, finalPath: destination })
    expect(receiver.task).toMatchObject({ status: 'paused', transferredBytes: 0, offsets: {}, checkpoints: {}, verified: [] })
    const restored = await receiver.restore()
    expect(restored.offsets[0]).toBe(0)
    await writeAll(receiver, 0, 'abcdef'); await receiver.finish(0)
    expect((await receiver.commit()).path).toBe(destination)
  })

  it('refuses migration if the old parent has become a link, even when the old partial file is absent', async () => {
    const { receiver, manifest, task } = fixture([{ path: 'one', data: 'abc' }])
    const parent = join(directory, 'old-parent')
    const outside = join(directory, 'outside')
    await mkdir(parent); await mkdir(outside)
    task.localPath = join(parent, 'result'); task.temporaryPath = join(parent, `.arttalk-${randomUUID()}.part`)
    await receiver.prepare(manifest); await receiver.suspend('manual')
    await rm(parent, { recursive: true })
    await symlink(outside, parent, process.platform === 'win32' ? 'junction' : 'dir')
    const oldPath = task.temporaryPath
    await expect(receiver.changeDestination(join(directory, 'new-result'))).rejects.toThrow(/链接/)
    expect(task.temporaryPath).toBe(oldPath)
    expect(task.status).toBe('paused')
  })

  it('copies valid partial checkpoints to a new destination and keeps the task manually paused', async () => {
    const data = 'longer content'
    const { receiver, manifest, task } = fixture([{ path: 'one', data }, { path: 'empty/zero', data: '' }], ['empty'], 'folder')
    await receiver.prepare(manifest)
    await receiver.write(0, 0, bytes('longer'))
    await receiver.finish(1)
    const old = task.temporaryPath!
    const destination = join(directory, 'new-parent', 'new-result')
    expect(await receiver.changeDestination(destination)).toEqual({ success: true, finalPath: destination })
    expect(receiver.task.status).toBe('paused')
    expect(receiver.task.offsets).toMatchObject({ 0: 6, 1: 0 })
    await expect(stat(old)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await readFile(join(receiver.task.temporaryPath!, 'one'))).toString()).toBe('longer')
    const restored = await receiver.restore()
    expect(restored.offsets[0]).toBe(6)
    await writeAll(receiver, 0, data, 6); await receiver.finish(0)
    const result = await receiver.commit()
    expect(result.path).toBe(destination)
  })

  it('keeps partial files in the old destination when the new path is a link', async () => {
    const { receiver, manifest, task } = fixture([{ path: 'one', data: 'abcdef' }])
    await receiver.prepare(manifest); await receiver.write(0, 0, bytes('abc'))
    const outside = join(directory, 'outside'); await mkdir(outside)
    const link = join(directory, 'linked')
    await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
    const old = task.temporaryPath!
    await expect(receiver.changeDestination(join(link, 'new'))).rejects.toThrow(/链接/)
    expect(task.temporaryPath).toBe(old)
    expect((await readFile(old)).toString()).toBe('abc')
  })

  it('checks copied checkpoint bytes and preserves the old partial data on copy corruption', async () => {
    const { task, manifest } = fixture([{ path: 'one', data: 'abcdef' }], [], 'folder')
    const receiver = new P2pReceiver(task, async (value) => { snapshots.push(structuredClone(value)) }, undefined,
      async (source, destination, options) => {
        await cp(source, destination, options)
        await writeFile(join(String(destination), 'one'), 'BAD')
      })
    receivers.push(receiver)
    await receiver.prepare(manifest); await receiver.write(0, 0, bytes('abc'))
    const old = receiver.task.temporaryPath!
    await expect(receiver.changeDestination(join(directory, 'new-parent', 'new-result'))).rejects.toThrow(/复制后的部分文件校验失败/)
    expect(receiver.task.temporaryPath).toBe(old)
    expect((await readFile(join(old, 'one'))).toString()).toBe('abc')
    const restored = await receiver.restore()
    expect(restored.offsets[0]).toBe(3)
  })

  it('refuses completion if a verified file was changed, or an unexpected file was added', async () => {
    const { receiver, manifest, task } = fixture([{ path: 'one', data: 'correct' }], [], 'folder')
    await receiver.prepare(manifest); await writeAll(receiver, 0, 'correct'); await receiver.finish(0)
    await writeFile(join(task.temporaryPath!, 'extra'), 'unexpected')
    await expect(receiver.commit()).rejects.toThrow(/提交前文件校验失败/)
    await rm(join(task.temporaryPath!, 'extra'))
    await writeFile(join(task.temporaryPath!, 'one'), 'changed')
    await expect(receiver.commit()).rejects.toThrow(/提交前文件校验失败/)
    await expect(stat(task.localPath!)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
