import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, lstat, open, readdir, realpath } from 'node:fs/promises'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { safeP2pRelativePath } from './p2pReceiveSafety.js'

export interface P2pSourceDescriptor {
  sourceId: string
  kind: 'file' | 'folder'
  name: string
  totalSize: number
  fileCount: number
  directoryCount: number
}

export interface P2pSourceManifestEntry {
  index: number
  path: string
  name: string
  size: number
  contentType: string
  sha256: string
}

export interface P2pSourceManifest {
  version: 2
  kind: 'file' | 'folder'
  name: string
  totalSize: number
  fileCount: number
  directories: string[]
  files: P2pSourceManifestEntry[]
  manifestSha256: string
}

interface SourceFile {
  path: string
  relativePath: string
  size: number
  mtimeMs: number
  ctimeMs: number
  dev: number
  ino: number
}

export interface P2pSourceRecord {
  source: P2pSourceDescriptor
  rootPath: string
  files: SourceFile[]
  directories: string[]
  manifest?: P2pSourceManifest
}

export interface P2pSourceStoreOptions {
  load: (userId: string) => Promise<P2pSourceRecord[]>
  save: (userId: string, sources: P2pSourceRecord[]) => Promise<void>
  onProgress?: (value: { sourceId: string; progress: number; phase: string }) => void
}

const MAX_FILE_SIZE = 2 * 1024 ** 3
const MAX_FOLDER_SIZE = 20 * 1024 ** 3
const MAX_ENTRIES = 10_000
const MAX_CHUNK_SIZE = 64 * 1024
const MAX_MANIFEST_BYTES = 16 * 1024 ** 2
const comparePaths = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0

function aborted() {
  const error = new Error('文件准备已暂停')
  error.name = 'AbortError'
  return error
}

function ensureActive(signal?: AbortSignal) {
  if (signal?.aborted) throw aborted()
}

function descriptor(record: P2pSourceRecord) {
  return { ...record.source }
}

function fingerprint(left: SourceFile, right: SourceFile) {
  return left.relativePath === right.relativePath && left.size === right.size
    && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs
    && left.dev === right.dev && left.ino === right.ino
}

function sameTree(left: P2pSourceRecord, right: P2pSourceRecord) {
  return left.source.kind === right.source.kind && left.files.length === right.files.length
    && left.files.every((file, index) => fingerprint(file, right.files[index]!))
    && JSON.stringify(left.directories) === JSON.stringify(right.directories)
}

/** Native selection grants access to a complete tree; unreadable or unsafe entries reject it. */
export async function scanP2pSource(path: string, sourceId = `src_${randomUUID().replace(/-/g, '')}`,
  signal?: AbortSignal): Promise<P2pSourceRecord> {
  if (!path || !isAbsolute(path)) throw new Error('请选择本机文件或文件夹')
  const rootPath = resolve(path)
  const rootStat = await lstat(rootPath)
  if (rootStat.isSymbolicLink() || (!rootStat.isFile() && !rootStat.isDirectory())) {
    throw new Error('文件传输不支持符号链接或特殊文件')
  }
  // Reject junctions / symlink ancestors instead of silently following a different tree.
  const physicalRoot = await realpath(rootPath)
  if (resolve(physicalRoot).toLowerCase() !== rootPath.toLowerCase()) {
    throw new Error('文件路径包含链接，请选择原始文件或目录')
  }
  const kind = rootStat.isDirectory() ? 'folder' : 'file'
  const name = safeP2pRelativePath(basename(rootPath))
  const files: SourceFile[] = []
  const directories: string[] = []
  const occupied = new Set<string>()
  let totalSize = 0
  const visit = async (nativePath: string, rawRelative: string) => {
    ensureActive(signal)
    const info = await lstat(nativePath)
    if (info.isSymbolicLink()) throw new Error(`文件夹包含链接：${rawRelative}`)
    const normalized = safeP2pRelativePath(rawRelative)
    const key = normalized.toLowerCase()
    if (occupied.has(key)) throw new Error(`文件夹包含重名或规范化冲突：${rawRelative}`)
    occupied.add(key)
    await access(nativePath, constants.R_OK)
    if (info.isDirectory()) {
      directories.push(normalized)
      if (directories.length > MAX_ENTRIES) throw new Error('文件夹目录数不能超过 10000')
      const children = await readdir(nativePath)
      children.sort(comparePaths)
      for (const child of children) await visit(join(nativePath, child), `${normalized}/${child}`)
    } else if (info.isFile()) {
      if (!Number.isSafeInteger(info.size) || info.size > MAX_FILE_SIZE) {
        throw new Error(`文件超过 2 GiB：${rawRelative}`)
      }
      files.push({ path: nativePath, relativePath: normalized, size: info.size,
        mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs, dev: info.dev, ino: info.ino })
      totalSize += info.size
      if (files.length > MAX_ENTRIES || totalSize > MAX_FOLDER_SIZE) {
        throw new Error('文件夹超过 10000 个文件或 20 GiB')
      }
    } else throw new Error(`文件夹包含不支持的特殊条目：${rawRelative}`)
  }
  await access(rootPath, constants.R_OK)
  if (kind === 'folder') {
    const children = (await readdir(rootPath)).sort(comparePaths)
    for (const child of children) await visit(join(rootPath, child), child)
  } else await visit(rootPath, name)
  files.sort((left, right) => comparePaths(left.relativePath, right.relativePath))
  directories.sort(comparePaths)
  ensureActive(signal)
  return { rootPath, files, directories, source: {
    sourceId, kind, name, totalSize, fileCount: files.length, directoryCount: directories.length,
  } }
}

/** Matches the v2 renderer wire manifest's explicit canonical field order. */
export function p2pSourceManifestHash(manifest: Omit<P2pSourceManifest, 'manifestSha256'>) {
  const serialized = JSON.stringify({
    version: manifest.version, kind: manifest.kind, name: manifest.name,
    totalSize: manifest.totalSize, fileCount: manifest.fileCount,
    directories: manifest.directories,
    files: manifest.files.map((entry) => ({ index: entry.index, path: entry.path, name: entry.name,
      size: entry.size, contentType: entry.contentType, sha256: entry.sha256 })),
  })
  if (Buffer.byteLength(serialized, 'utf8') > MAX_MANIFEST_BYTES) throw new Error('文件清单超过 16 MiB')
  return createHash('sha256').update(serialized).digest('hex')
}

export class P2pSourceStore {
  private account: string | null = null
  private generation = 0
  private records = new Map<string, P2pSourceRecord>()
  private mutations: Promise<void> = Promise.resolve()
  private preparations = new Map<string, { controller: AbortController;
    promise: Promise<{ source: P2pSourceDescriptor; manifest: P2pSourceManifest }> }>()
  private validated = new Set<string>()

  constructor(private readonly options: P2pSourceStoreOptions) {}

  async setAccount(userId: string | null) {
    this.generation += 1
    const generation = this.generation
    this.account = null
    for (const preparation of this.preparations.values()) preparation.controller.abort()
    await this.mutations
    this.records.clear()
    this.validated.clear()
    if (!userId) return
    const records = await this.options.load(userId)
    if (generation !== this.generation) throw aborted()
    if (!Array.isArray(records)) throw new Error('本地源文件记录损坏')
    for (const record of records) {
      if (!record?.source?.sourceId || !isAbsolute(record.rootPath) || !Array.isArray(record.files)
        || !Array.isArray(record.directories)) throw new Error('本地源文件记录损坏')
    }
    this.records = new Map(records.map((record) => [record.source.sourceId, record]))
    this.account = userId
  }

  private assertAccount(generation = this.generation) {
    if (!this.account) throw new Error('请先登录后使用文件传输')
    if (generation !== this.generation) throw aborted()
    return this.account
  }

  get(sourceId: string): P2pSourceRecord {
    return structuredClone(this.getRecord(sourceId))
  }

  private getRecord(sourceId: string): P2pSourceRecord {
    this.assertAccount()
    const record = this.records.get(sourceId)
    if (!record) throw new Error('源文件记录不可用，请重新选择源文件')
    return record
  }

  private async persist(records: P2pSourceRecord[], generation: number) {
    const operation = this.mutations.then(async () => {
      const account = this.assertAccount(generation)
      const next = new Map(this.records)
      for (const record of records) next.set(record.source.sourceId, record)
      await this.options.save(account, [...next.values()])
      this.assertAccount(generation)
      this.records = next
    })
    this.mutations = operation.catch(() => undefined)
    return operation
  }

  async importPaths(paths: string[]): Promise<P2pSourceDescriptor[]> {
    this.assertAccount()
    const generation = this.generation
    if (!Array.isArray(paths) || !paths.length || paths.length > MAX_ENTRIES
      || paths.some((path) => typeof path !== 'string' || !path || !isAbsolute(path))) {
      throw new Error('请选择 1 至 10000 个本机文件或目录')
    }
    const records: P2pSourceRecord[] = []
    for (const path of [...new Set(paths.map((value) => resolve(value)))]) {
      this.assertAccount(generation)
      records.push(await scanP2pSource(path))
    }
    await this.persist(records, generation)
    return records.map(descriptor)
  }

  cancel(sourceId: string) {
    this.preparations.get(sourceId)?.controller.abort()
  }

  async validate(sourceId: string) {
    const original = this.get(sourceId)
    const generation = this.generation
    const current = await scanP2pSource(original.rootPath, sourceId)
    this.assertAccount(generation)
    if (!sameTree(original, current)) throw new Error('源文件或文件夹已变化，请重新选择并发送')
    return descriptor(original)
  }

  prepare(sourceId: string): Promise<{ source: P2pSourceDescriptor; manifest: P2pSourceManifest }> {
    const existing = this.preparations.get(sourceId)
    if (existing && !existing.controller.signal.aborted) return existing.promise
    const controller = new AbortController()
    const operation = this.prepareRecord(sourceId, controller.signal)
    this.preparations.set(sourceId, { controller, promise: operation })
    void operation.finally(() => {
      if (this.preparations.get(sourceId)?.controller === controller) this.preparations.delete(sourceId)
    }).catch(() => undefined)
    return operation
  }

  private async prepareRecord(sourceId: string, signal: AbortSignal) {
    const original = this.get(sourceId)
    const generation = this.generation
    const current = await scanP2pSource(original.rootPath, sourceId, signal)
    current.source.name = original.source.name
    if (original.manifest && sameTree(original, current) && this.validated.has(sourceId)) {
      this.assertAccount(generation)
      this.options.onProgress?.({ sourceId, phase: 'ready', progress: 1 })
      return { source: descriptor(original), manifest: structuredClone(original.manifest) }
    }
    current.manifest = await this.hashManifest(current, signal)
    if (original.manifest) {
      if (!this.sameContent(original.manifest, current.manifest)) {
        this.validated.delete(sourceId)
        throw new Error('源文件内容或目录结构已改变，请重新选择作为新文件发送')
      }
      current.manifest = original.manifest
    }
    ensureActive(signal)
    await this.persist([current], generation)
    this.validated.add(sourceId)
    return { source: descriptor(current), manifest: structuredClone(current.manifest) }
  }

  private async hashManifest(record: P2pSourceRecord, signal: AbortSignal) {
    const entries: P2pSourceManifestEntry[] = []
    let processed = 0
    let lastProgress = 0
    const progress = (force = false) => {
      if (force || Date.now() - lastProgress >= 100) {
        lastProgress = Date.now()
        this.options.onProgress?.({ sourceId: record.source.sourceId, phase: 'hashing',
          progress: record.source.totalSize ? processed / record.source.totalSize : 0 })
      }
    }
    progress(true)
    for (const [index, file] of record.files.entries()) {
      ensureActive(signal)
      await this.checkSourceFile(file)
      const handle = await open(file.path, 'r')
      try {
        const info = await handle.stat()
        if (info.dev !== file.dev || info.ino !== file.ino) throw new Error('源文件已被替换')
        const hash = createHash('sha256')
        const stream = handle.createReadStream({ autoClose: false, highWaterMark: 1024 * 1024 })
        for await (const chunk of stream) {
          ensureActive(signal)
          hash.update(chunk)
          processed += chunk.length
          progress()
        }
        await this.checkSourceFile(file)
        entries.push({ index, path: file.relativePath, name: basename(file.relativePath),
          size: file.size, contentType: 'application/octet-stream', sha256: hash.digest('hex') })
      } finally { await handle.close() }
    }
    const rescanned = await scanP2pSource(record.rootPath, record.source.sourceId, signal)
    if (!sameTree(record, rescanned)) throw new Error('准备期间源文件或目录发生变化，请重新发送')
    const base: Omit<P2pSourceManifest, 'manifestSha256'> = {
      version: 2, kind: record.source.kind, name: record.source.name,
      totalSize: record.source.totalSize, fileCount: record.files.length,
      directories: record.directories, files: entries,
    }
    const manifest = { ...base, manifestSha256: p2pSourceManifestHash(base) }
    this.options.onProgress?.({ sourceId: record.source.sourceId, phase: 'ready', progress: 1 })
    return manifest
  }

  private async checkSourceFile(file: SourceFile) {
    const info = await lstat(file.path)
    if (!info.isFile() || info.isSymbolicLink() || resolve(await realpath(file.path)).toLowerCase()
      !== resolve(file.path).toLowerCase() || !fingerprint(file, { ...file, size: info.size,
        mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs, dev: info.dev, ino: info.ino })) {
      throw new Error('源文件已移动或修改，请重新定位源文件')
    }
  }

  private sameContent(expected: P2pSourceManifest, actual: P2pSourceManifest) {
    return expected.kind === actual.kind && expected.totalSize === actual.totalSize
      && expected.fileCount === actual.fileCount
      && JSON.stringify(expected.directories) === JSON.stringify(actual.directories)
      && expected.files.every((entry, index) => {
        const other = actual.files[index]
        return other && entry.size === other.size && entry.sha256 === other.sha256
          && (expected.kind === 'file' || entry.path === other.path)
      })
  }

  /** A native picker supplies a new location; the original message's manifest stays immutable. */
  async locate(sourceId: string, path: string) {
    const original = this.get(sourceId)
    const generation = this.generation
    this.cancel(sourceId)
    const controller = new AbortController()
    const operation = (async () => {
      const current = await scanP2pSource(path, sourceId, controller.signal)
      if (current.source.kind !== original.source.kind) throw new Error('请选择原类型的文件或文件夹')
      current.source.name = original.source.name
      current.manifest = await this.hashManifest(current, controller.signal)
      if (original.manifest) {
        if (!this.sameContent(original.manifest, current.manifest)) {
          throw new Error('所选文件内容或目录结构与原文件不一致，请作为新文件发送')
        }
        current.manifest = original.manifest
      }
      ensureActive(controller.signal)
      await this.persist([current], generation)
      this.validated.add(sourceId)
      return { source: descriptor(current), manifest: structuredClone(current.manifest) }
    })()
    this.preparations.set(sourceId, { controller, promise: operation })
    void operation.finally(() => {
      if (this.preparations.get(sourceId)?.controller === controller) this.preparations.delete(sourceId)
    }).catch(() => undefined)
    return operation
  }

  async readChunk(sourceId: string, fileIndex: number, offset: number, length: number): Promise<ArrayBuffer> {
    const record = this.getRecord(sourceId)
    const generation = this.generation
    const file = record.files[fileIndex]
    if (!record.manifest || !this.validated.has(sourceId) || !Number.isSafeInteger(fileIndex) || !file
      || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length)
      || length <= 0 || length > MAX_CHUNK_SIZE || offset + length > file.size) {
      throw new Error('无效的源文件分片读取请求')
    }
    await this.checkSourceFile(file)
    const handle = await open(file.path, 'r')
    try {
      const info = await handle.stat()
      if (info.dev !== file.dev || info.ino !== file.ino) throw new Error('源文件已被替换')
      const buffer = new Uint8Array(length)
      const result = await handle.read(buffer, 0, length, offset)
      if (result.bytesRead !== length) throw new Error('源文件读取不完整')
      await this.checkSourceFile(file)
      this.assertAccount(generation)
      return buffer.buffer
    } finally { await handle.close() }
  }
}
