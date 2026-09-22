import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, stat, lstat, realpath, statfs, rename, rm, cp, readdir } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { dirname, basename, join, resolve, relative, isAbsolute } from 'node:path'
import { assertP2pWriteBounds, resolveP2pEntryPath, safeP2pRelativePath } from './p2pReceiveSafety.js'
import type { NativeTask as NativeP2pTask } from './p2pTaskStorage.js'

export interface ReceiveManifest {
  version: 1 | 2; kind: 'file' | 'folder'; name: string; totalSize: number; fileCount: number
  directories?: string[]
  files: Array<{ index: number; path: string; name: string; size: number; contentType: string; sha256: string }>
  manifestSha256: string
}
const CHECKPOINT = 4 * 1024 * 1024
type Progress = (event: { receiveId: string; phase: 'verifying' | 'committing'; processedBytes: number; totalBytes: number; sequence?: number }) => void
type ReceiverTask = NativeP2pTask & {
  destinationParentRealPath?: string
  commitIntent?: { temporaryPath: string; finalPath: string }
  cleanupPending?: boolean
  cleanupError?: string
}
const nativePath = (path: string) => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)

/** Every existing ancestor must be a real directory, never a junction or symlink. */
async function safeAncestors(path: string) {
  let current = resolve(path)
  for (;;) {
    const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (info && (info.isSymbolicLink() || !info.isDirectory())) throw new Error('保存路径包含链接或非目录条目')
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
}

export function manifestHash(manifest: ReceiveManifest) {
  return createHash('sha256').update(JSON.stringify({ version: manifest.version, kind: manifest.kind, name: manifest.name,
    totalSize: manifest.totalSize, fileCount: manifest.fileCount,
    ...(manifest.version === 2 ? { directories: manifest.directories || [] } : {}),
    files: manifest.files.map(({ index, path, name, size, contentType, sha256 }) => ({ index, path, name, size, contentType, sha256 })),
  })).digest('hex')
}

export function validateReceiveManifest(manifest: ReceiveManifest, task: Pick<NativeP2pTask, 'kind' | 'name' | 'totalSize' | 'fileCount' | 'directoryCount' | 'content'>) {
  if (![1, 2].includes(manifest?.version) || !Array.isArray(manifest.files)
    || manifest.files.length !== task.fileCount || manifest.fileCount !== task.fileCount
    || manifest.totalSize !== task.totalSize || manifest.kind !== task.kind || manifest.name !== task.name
    || task.fileCount > 10000 || !Number.isSafeInteger(task.totalSize) || task.totalSize < 0
    || (manifest.version === 1 && (task.totalSize === 0 || task.fileCount === 0))
    || (task.kind === 'file' && task.fileCount !== 1) || manifestHash(manifest) !== manifest.manifestSha256) throw new Error('文件清单校验失败')
  const directories = manifest.version === 2 ? manifest.directories : []
  if (!Array.isArray(directories) || directories.length !== (task.directoryCount || 0) || directories.length > 10000
    || (task.kind === 'file' && directories.length)) throw new Error('目录清单数量无效')
  const paths = new Map<string, 'file' | 'directory'>()
  for (const path of directories) {
    const safe = safeP2pRelativePath(path)
    if (safe !== path || paths.has(safe.toLowerCase())) throw new Error(`目录路径冲突：${path}`)
    paths.set(safe.toLowerCase(), 'directory')
  }
  let total = 0
  for (const [index, entry] of manifest.files.entries()) {
    const safe = safeP2pRelativePath(entry.path)
    if (safe !== entry.path || entry.index !== index || !Number.isSafeInteger(entry.size)
      || entry.size < (manifest.version === 1 ? 1 : 0)
      || !/^[0-9a-f]{64}$/i.test(entry.sha256) || paths.has(safe.toLowerCase())) throw new Error(`文件条目无效：${entry.path}`)
    paths.set(safe.toLowerCase(), 'file'); total += entry.size
    if (!Number.isSafeInteger(total)) throw new Error('文件清单总大小无效')
  }
  if (total !== task.totalSize) throw new Error('文件总大小不一致')
  for (const path of paths.keys()) {
    const parts = path.split('/')
    for (let index = 1; index < parts.length; index++) {
      const parent = parts.slice(0, index).join('/')
      if (paths.get(parent) === 'file' || (manifest.version === 2 && !paths.has(parent))) throw new Error(`父目录冲突：${path}`)
    }
  }
  const summary = task.content as { sha256?: string; manifestSha256?: string } | undefined
  if ((summary?.sha256 && summary.sha256 !== manifest.files[0]?.sha256)
    || (summary?.manifestSha256 && summary.manifestSha256 !== manifest.manifestSha256)) throw new Error('文件清单与原消息不一致')
}

export async function pathExists(path: string) {
  try { await stat(path); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
}

export async function checkDestination(parent: string, remaining: number) {
  if (!isAbsolute(parent) || !Number.isSafeInteger(remaining) || remaining < 0) throw new Error('保存位置或空间声明无效')
  await safeAncestors(parent)
  await mkdir(parent, { recursive: true })
  await safeAncestors(parent)
  const probe = join(parent, `.arttalk-check-${randomUUID()}`)
  const handle = await open(probe, 'wx')
  await handle.close(); await rm(probe)
  const disk = await statfs(parent)
  if (disk.bavail * disk.bsize < remaining) throw new Error('磁盘空间不足，请释放空间或更换保存位置')
}

export async function uniqueResultPath(path: string) {
  if (!await pathExists(path)) return path
  const root = dirname(path); const name = basename(path)
  for (let suffix = 1; ; suffix++) {
    const candidate = join(root, `${name} (${suffix})`)
    if (!await pathExists(candidate)) return candidate
  }
}

export async function hashPath(path: string, progress?: (bytes: number) => void, start = 0, end?: number) {
  const hash = createHash('sha256')
  let bytes = 0
  if (end === start) return hash.digest('hex')
  for await (const chunk of createReadStream(path, { start, ...(end === undefined ? {} : { end: end - 1 }), highWaterMark: 1024 * 1024 })) {
    hash.update(chunk); bytes += chunk.length; progress?.(bytes)
  }
  return hash.digest('hex')
}

/** Main-owned receive runtime. File bytes and checkpoints never travel through the signalling server. */
export class P2pReceiver {
  private handles = new Map<number, FileHandle>()
  private blockHashes = new Map<number, ReturnType<typeof createHash>>()
  private offsets = new Map<number, number>()
  private chain: Promise<unknown> = Promise.resolve()
  private suspended = false
  private cancelled = false
  private epoch = 0
  private progressSequence = 0
  constructor(public task: ReceiverTask, private save: (task: NativeP2pTask) => Promise<unknown>, private progress?: Progress,
    private readonly copy = cp) {}
  private manifest() { if (!this.task.manifest) throw new Error('尚未收到文件清单'); return this.task.manifest as ReceiveManifest }
  private path(index: number) {
    const entry = this.manifest().files[index]
    if (!entry || !this.task.temporaryPath) throw new Error('接收文件不存在')
    return this.task.kind === 'file' ? this.task.temporaryPath : resolveP2pEntryPath(this.task.temporaryPath, entry.path)
  }
  private async safeFile(path: string) {
    await this.safeDestination()
    await safeAncestors(dirname(path))
    const root = resolve(this.task.kind === 'file' ? dirname(this.task.temporaryPath!) : this.task.temporaryPath!)
    const actualParent = await realpath(dirname(path))
    const actualRoot = await realpath(root)
    const confined = relative(actualRoot, actualParent)
    if (confined.startsWith('..') || isAbsolute(confined)) throw new Error('接收路径已改变，操作已停止')
    const info = await lstat(path)
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('接收路径不是普通文件')
  }
  private async safeDestination() {
    const temporary = this.task.temporaryPath
    const finalPath = this.task.localPath
    if (!temporary || !finalPath || !isAbsolute(temporary) || !isAbsolute(finalPath)
      || nativePath(dirname(temporary)) !== nativePath(dirname(finalPath))
      || !/^\.arttalk-[0-9a-f-]+\.part$/i.test(basename(temporary))) throw new Error('临时文件路径校验失败')
    await safeAncestors(dirname(temporary))
    const actual = await realpath(dirname(temporary))
    if (this.task.destinationParentRealPath && nativePath(actual) !== nativePath(this.task.destinationParentRealPath)) {
      throw new Error('保存目录已移动或改变，请重新选择保存位置')
    }
    this.task.destinationParentRealPath ||= actual
    const temporaryInfo = await lstat(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (temporaryInfo?.isSymbolicLink()) throw new Error('临时接收路径不能为链接')
  }
  private async persist() {
    this.task.transferredBytes = Object.values(this.task.offsets || {}).reduce((sum, offset) => sum + offset, 0)
    this.task.progress = this.task.status === 'completed' ? 1
      : this.task.totalSize ? Math.min(1, this.task.transferredBytes / this.task.totalSize) : 0
    this.task.completedFiles = this.task.verified?.length || 0
    await this.save(this.task)
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.chain.catch(() => undefined).then(operation)
    this.chain = next
    return next
  }
  async prepare(manifest: ReceiveManifest) {
    const epoch = this.epoch
    return this.enqueue(async () => {
      if (epoch !== this.epoch) throw new Error('接收状态已改变')
      if (this.cancelled) throw new Error('接收已取消')
      if (['completed', 'cancelled', 'stopped', 'recalled'].includes(this.task.status)) {
        throw new Error('接收任务已结束，请创建新的接收任务')
      }
      validateReceiveManifest(manifest, this.task)
      if (this.task.manifest && this.task.manifest.manifestSha256 !== manifest.manifestSha256) throw new Error('恢复清单与原任务不一致')
      this.task.manifest = manifest
      this.task.offsets ||= {}; this.task.checkpoints ||= {}; this.task.verified ||= []
      this.suspended = true
      await checkDestination(dirname(this.task.temporaryPath!), this.task.totalSize - (this.task.transferredBytes || 0))
      await this.safeDestination()
      if (this.task.kind === 'folder') {
        await mkdir(this.task.temporaryPath!, { recursive: true })
        if ((await lstat(this.task.temporaryPath!)).isSymbolicLink()) throw new Error('临时目录不能为链接')
        this.report('verifying', 0, this.task.totalSize)
        for (const path of manifest.directories || []) {
          const target = resolveP2pEntryPath(this.task.temporaryPath!, path)
          await safeAncestors(target)
          await mkdir(target, { recursive: true })
          this.report('verifying', 0, this.task.totalSize)
        }
      }
      for (const entry of manifest.files) {
        const path = this.path(entry.index)
        await safeAncestors(dirname(path))
        await mkdir(dirname(path), { recursive: true })
        if (!await pathExists(path)) { const file = await open(path, 'wx'); await file.close() }
        await this.safeFile(path)
        await this.recoverFile(entry.index)
      }
      if (epoch !== this.epoch) throw new Error('接收状态已改变')
      this.task.prepared = true
      this.suspended = false
      this.task.status = 'receiving'
      await this.persist()
      return { offsets: Object.fromEntries(this.offsets), finalPath: this.task.localPath! }
    })
  }
  private async recoverFile(index: number) {
    const entry = this.manifest().files[index]!
    const path = this.path(index)
    let offset = 0
    const valid: Array<{ offset: number; sha256: string }> = []
    const size = (await stat(path)).size
    this.report('verifying', 0, entry.size)
    for (const checkpoint of this.task.checkpoints?.[index] || []) {
      if (!Number.isSafeInteger(checkpoint.offset) || checkpoint.offset <= offset || checkpoint.offset > entry.size || checkpoint.offset > size) break
      const start = offset
      if (await hashPath(path, (bytes) => this.report('verifying', start + bytes, entry.size), start, checkpoint.offset) !== checkpoint.sha256) break
      valid.push(checkpoint); offset = checkpoint.offset
    }
    if (this.task.verified?.includes(index)) {
      const hash = size === entry.size ? await hashPath(path, (bytes) => this.report('verifying', bytes, entry.size)) : ''
      if (hash === entry.sha256) offset = entry.size
      else { offset = 0; valid.length = 0; this.task.verified = this.task.verified.filter((value) => value !== index) }
    }
    this.task.checkpoints![index] = valid
    const handle = await open(path, 'r+')
    await handle.truncate(offset); await handle.close()
    this.task.offsets![index] = offset; this.offsets.set(index, offset)
    this.blockHashes.set(index, createHash('sha256'))
  }
  private report(phase: 'verifying' | 'committing', processedBytes: number, totalBytes: number) {
    this.progress?.({ receiveId: this.task.receiveId || this.task.taskId, phase, processedBytes, totalBytes,
      sequence: ++this.progressSequence })
  }
  private assertRunning() {
    if (this.suspended || this.cancelled) throw new Error(this.cancelled ? '接收已取消' : '接收已暂停')
  }
  private async checkpoint(index: number, handle: FileHandle) {
    const offset = this.offsets.get(index) || 0
    if (offset <= (this.task.offsets?.[index] || 0)) return
    await handle.sync()
    const hash = this.blockHashes.get(index)!.digest('hex')
    ;(this.task.checkpoints![index] ||= []).push({ offset, sha256: hash })
    this.task.offsets![index] = offset
    this.blockHashes.set(index, createHash('sha256'))
    await this.persist()
  }
  async write(index: number, offset: number, data: ArrayBuffer) {
    return this.enqueue(async () => {
      this.assertRunning()
      if (!this.task.prepared) throw new Error('尚未准备接收文件')
      const entry = this.manifest().files[index]
      if (!entry || this.task.verified?.includes(index)) throw new Error('文件索引无效或已经完成')
      const buffer = Buffer.from(data)
      assertP2pWriteBounds(entry.size, this.offsets.get(index) || 0, offset, buffer.length, 64 * 1024)
      let handle = this.handles.get(index)
      if (!handle) {
        await this.safeFile(this.path(index)); handle = await open(this.path(index), 'r+'); this.handles.set(index, handle)
      }
      let written = 0
      while (written < buffer.length) {
        const result = await handle.write(buffer, written, buffer.length - written, offset + written)
        if (!result.bytesWritten) throw new Error('磁盘写入没有进展')
        written += result.bytesWritten
      }
      this.offsets.set(index, offset + written)
      this.blockHashes.get(index)!.update(buffer)
      if (offset + written - (this.task.offsets?.[index] || 0) >= CHECKPOINT || offset + written === entry.size) await this.checkpoint(index, handle)
      this.assertRunning()
      return { offset: offset + written, durableOffset: this.task.offsets?.[index] || 0 }
    })
  }
  async finish(index: number) {
    return this.enqueue(async () => {
      this.assertRunning()
      const entry = this.manifest().files[index]
      if (!entry || this.offsets.get(index) !== entry.size) throw new Error('文件尚未接收完整')
      if (this.task.verified?.includes(index)) return { success: true, offset: entry.size, sha256: entry.sha256 }
      const handle = this.handles.get(index)
      if (handle) { await this.checkpoint(index, handle); await handle.close(); this.handles.delete(index) }
      this.task.status = 'verifying'
      await this.persist()
      await this.safeFile(this.path(index))
      const hash = await hashPath(this.path(index), (bytes) => { this.assertRunning(); this.report('verifying', bytes, entry.size) })
      this.assertRunning()
      if (hash !== entry.sha256) {
        const file = await open(this.path(index), 'r+'); await file.truncate(0); await file.close()
        this.offsets.set(index, 0); this.task.offsets![index] = 0; this.task.checkpoints![index] = []
        this.blockHashes.set(index, createHash('sha256')); this.task.status = 'failed'
        await this.persist()
        throw new Error(`文件校验失败：${entry.path}，重试时仅重传此文件`)
      }
      this.task.verified!.push(index); this.task.status = 'receiving'
      await this.persist()
      return { success: true, offset: entry.size, sha256: hash }
    })
  }
  async commit() {
    return this.enqueue(async () => {
      this.assertRunning()
      if (!this.task.prepared || this.task.verified?.length !== this.task.fileCount) throw new Error('文件尚未全部校验完成')
      await this.closeHandles()
      await this.safeDestination()
      if (!await verifyResult(this.task, this.task.temporaryPath!, (event) => this.report(event.phase, event.processedBytes, event.totalBytes))) throw new Error('提交前文件校验失败，请重试')
      this.assertRunning()
      this.task.localPath = await uniqueResultPath(this.task.localPath!)
      this.task.status = 'committing'
      this.task.commitIntent = { temporaryPath: this.task.temporaryPath!, finalPath: this.task.localPath }
      await this.persist()
      this.assertRunning()
      this.report('committing', 0, this.task.totalSize)
      await rename(this.task.temporaryPath!, this.task.localPath)
      this.task.status = 'completed'; this.task.transferredBytes = this.task.totalSize
      this.task.commitIntent = undefined
      await this.persist()
      this.report('committing', this.task.totalSize, this.task.totalSize)
      return { success: true, path: this.task.localPath, transferId: this.task.transferId }
    })
  }
  private async closeHandles() {
    for (const [index, handle] of this.handles) {
      await this.checkpoint(index, handle); await handle.close()
    }
    this.handles.clear()
  }
  async suspend(reason: string) {
    this.epoch++
    this.suspended = true
    await this.chain.catch(() => undefined)
    let ioError: unknown
    try { await this.closeHandles() } catch (error) {
      ioError = error
      // An unplugged receive disk must not keep the user's account session alive.
      await Promise.allSettled([...this.handles.values()].map((handle) => handle.close()))
      this.handles.clear()
    }
    if (!['completed', 'cancelled', 'stopped', 'recalled'].includes(this.task.status)) {
      this.task.status = 'paused'; this.task.pauseReason = reason; this.task.desiredState = 'paused'
      if (ioError) {
        const detail = ioError instanceof Error ? ioError.message : String(ioError)
        this.task.error = `接收已暂停，保存位置暂不可用；恢复时将校验已有进度：${detail}`
      }
      // Account-local persistence errors still propagate; only receive-disk cleanup is best effort.
      await this.persist()
    }
    return true
  }
  async abort() {
    this.cancelled = true
    this.suspended = true
    this.epoch++
    await this.chain.catch(() => undefined)
    // Cancellation remains final even if flushing or deleting an offline drive fails.
    if (this.task.status === 'completed') return true
    this.task.status = 'cancelled'; this.task.desiredState = 'paused'; this.task.pauseReason = 'manual'
    this.task.cleanupPending = !!this.task.temporaryPath
    await this.persist()
    for (const handle of this.handles.values()) await handle.close().catch(() => undefined)
    this.handles.clear()
    await this.retryCleanup()
    return true
  }
  async retryCleanup(): Promise<{ success: boolean; cleanupPending: boolean; error?: string }> {
    if (!['cancelled', 'stopped', 'recalled'].includes(this.task.status)) {
      return { success: false, cleanupPending: !!this.task.cleanupPending, error: '仅可清理已终止任务的临时文件' }
    }
    try {
      if (this.task.temporaryPath) {
        await this.safeDestination()
        await rm(this.task.temporaryPath, { recursive: true, force: true })
      }
      this.task.cleanupPending = false; this.task.cleanupError = undefined; this.task.error = undefined
      this.task.checkpoints = {}; this.task.offsets = {}; this.task.verified = []
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      this.task.cleanupPending = true
      this.task.cleanupError = `传输已取消，临时文件暂未清理：${detail}。原保存位置恢复后可重试清理。`
      this.task.error = this.task.cleanupError
    }
    await this.persist()
    return { success: !this.task.cleanupPending, cleanupPending: !!this.task.cleanupPending, error: this.task.cleanupError }
  }
  async restore() {
    if (this.cancelled || ['cancelled', 'stopped', 'recalled'].includes(this.task.status)) throw new Error('接收任务已终止')
    await this.reconcile()
    this.suspended = false
    if (this.task.status === 'completed') return { success: true, status: 'completed', completed: true,
      receiveId: this.task.receiveId, finalPath: this.task.localPath, offsets: this.task.offsets || {} }
    if (this.task.manifest) await this.prepare(this.task.manifest as ReceiveManifest)
    return { success: true, status: this.task.status, completed: false,
      receiveId: this.task.receiveId, finalPath: this.task.localPath, offsets: Object.fromEntries(this.offsets) }
  }
  /** Startup only reconciles a completed rename, and never starts receiving or creates files. */
  async reconcile(): Promise<{ completed: boolean }> {
    return this.enqueue(async () => {
      if (this.task.status === 'completed') return { completed: true }
      const intent = this.task.commitIntent
      const wasCommitting = !!intent || this.task.status === 'committing'
      if (!wasCommitting || !this.task.localPath || !this.task.temporaryPath) return { completed: false }
      if (intent && (intent.finalPath !== this.task.localPath || intent.temporaryPath !== this.task.temporaryPath)) {
        throw new Error('接收提交记录损坏')
      }
      await this.safeDestination()
      if (!await pathExists(this.task.temporaryPath) && await pathExists(this.task.localPath)) {
        if (!await verifyResult(this.task, this.task.localPath, (event) => this.report(event.phase, event.processedBytes, event.totalBytes))) throw new Error('已保存文件校验失败，请重新接收')
        this.task.status = 'completed'; this.task.transferredBytes = this.task.totalSize
        this.task.commitIntent = undefined
        await this.persist()
        return { completed: true }
      }
      this.task.status = 'paused'; this.task.pauseReason = 'manual'; this.task.desiredState = 'paused'
      await this.persist()
      return { completed: false }
    })
  }
  async changeDestination(finalPath: string) {
    await this.suspend('manual')
    if (this.cancelled || ['completed', 'cancelled', 'stopped', 'recalled'].includes(this.task.status)) throw new Error('此任务不能更换接收位置')
    const oldTemporary = this.task.temporaryPath!
    // lstat detects dangling links too: they are unsafe existing data, not a missing source.
    const oldInfo = await lstat(oldTemporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (oldInfo) await this.safeDestination()
    else await safeAncestors(dirname(oldTemporary))
    const nextTemporary = join(dirname(finalPath), `.arttalk-${randomUUID()}.part`)
    const oldTask = structuredClone(this.task)
    await checkDestination(dirname(finalPath), this.task.totalSize)
    if (oldInfo) {
      // Validate existing content and paths before copying user-owned partial data.
      for (const entry of this.task.manifest?.files || []) {
        await this.safeFile(this.path(entry.index))
        await this.recoverFile(entry.index)
      }
      await this.persist()
      await this.copy(oldTemporary, nextTemporary, { recursive: true, force: false, errorOnExist: true, dereference: false })
    }
    this.task.localPath = finalPath; this.task.temporaryPath = nextTemporary; this.task.destinationParentRealPath = undefined
    this.task.commitIntent = undefined
    if (!oldInfo) {
      this.task.offsets = {}; this.task.checkpoints = {}; this.task.verified = []; this.task.prepared = false
      this.offsets.clear(); this.blockHashes.clear()
    }
    try {
      await this.safeDestination()
      if (this.task.manifest && await pathExists(nextTemporary)) {
        for (const entry of this.manifest().files) {
          await this.safeFile(this.path(entry.index))
          // Validate every copied checkpoint before abandoning the original partial data.
          const before = this.task.offsets?.[entry.index] || 0
          await this.recoverFile(entry.index)
          if ((this.task.offsets?.[entry.index] || 0) !== before) throw new Error('复制后的部分文件校验失败')
        }
      }
      await this.persist()
    } catch (error) {
      Object.assign(this.task, oldTask)
      await safeAncestors(dirname(nextTemporary))
      const info = await lstat(nextTemporary).catch(() => null)
      if (info && !info.isSymbolicLink()) await rm(nextTemporary, { recursive: true, force: true }).catch(() => undefined)
      throw error
    }
    if (oldInfo) {
      await safeAncestors(dirname(oldTemporary))
      if (await pathExists(oldTemporary)) await rm(oldTemporary, { recursive: true, force: true })
    }
    return { success: true, finalPath }
  }
}

export async function verifyResult(task: NativeP2pTask, path: string, progress?: Progress) {
  const manifest = task.manifest as ReceiveManifest | undefined
  if (!manifest || !await pathExists(path)) return false
  await safeAncestors(dirname(path))
  const rootInfo = await lstat(path)
  if (rootInfo.isSymbolicLink() || (task.kind === 'folder' ? !rootInfo.isDirectory() : !rootInfo.isFile())) return false
  if (task.kind === 'folder') {
    const expectedFiles = new Set(manifest.files.map((file) => file.path))
    const expectedDirectories = new Set(manifest.directories || [])
    if (manifest.version === 1) {
      for (const entry of manifest.files) {
        const parts = entry.path.split('/')
        for (let count = 1; count < parts.length; count++) expectedDirectories.add(parts.slice(0, count).join('/'))
      }
    }
    const inspect = async (parent: string, prefix = ''): Promise<boolean> => {
      const entries = await readdir(parent, { withFileTypes: true })
      progress?.({ receiveId: task.receiveId || task.taskId, phase: 'verifying', processedBytes: 0, totalBytes: task.totalSize })
      for (const entry of entries) {
        const name = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isSymbolicLink()) return false
        if (entry.isDirectory()) {
          if (!expectedDirectories.has(name) || !await inspect(join(parent, entry.name), name)) return false
        } else if (!entry.isFile() || !expectedFiles.has(name)) return false
      }
      return true
    }
    if (!await inspect(path)) return false
  }
  for (const directory of manifest.directories || []) {
    const info = await lstat(resolveP2pEntryPath(path, directory)).catch(() => null)
    if (!info?.isDirectory() || info.isSymbolicLink()) return false
    progress?.({ receiveId: task.receiveId || task.taskId, phase: 'verifying', processedBytes: 0, totalBytes: task.totalSize })
  }
  for (const entry of manifest.files) {
    const file = task.kind === 'file' ? path : resolveP2pEntryPath(path, entry.path)
    await safeAncestors(dirname(file))
    const info = await lstat(file).catch(() => null)
    if (!info?.isFile() || info.isSymbolicLink() || info.size !== entry.size) return false
    progress?.({ receiveId: task.receiveId || task.taskId, phase: 'verifying', processedBytes: 0, totalBytes: entry.size })
    if (await hashPath(file, (bytes) => progress?.({ receiveId: task.receiveId || task.taskId, phase: 'verifying', processedBytes: bytes, totalBytes: entry.size })) !== entry.sha256) return false
  }
  return true
}
