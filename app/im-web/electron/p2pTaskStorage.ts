import { safeStorage } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { P2pSourceRecord } from './p2pSources.js'

export interface NativeP2pManifestEntry {
  index: number
  path: string
  name: string
  size: number
  contentType: string
  sha256: string
}

export interface NativeP2pManifest {
  version: 1 | 2
  kind: 'file' | 'folder'
  name: string
  totalSize: number
  fileCount: number
  directories?: string[]
  files: NativeP2pManifestEntry[]
  manifestSha256: string
}

export interface NativeP2pAttachmentSummary {
  version: 1 | 2
  transferMode: 'p2p_lan'
  transferId: string
  kind: 'file' | 'folder'
  name: string
  totalSize: number
  fileCount: number
  directoryCount?: number
  sha256?: string
  manifestSha256?: string
  fileName?: string
  fileSize?: number
  folderName?: string
}

/** Full native record. Receiver paths, manifests and durable checkpoints are main-process owned. */
export interface NativeTask {
  taskId: string
  transferId: string
  direction: 'send' | 'receive'
  status: string
  name: string
  kind: 'file' | 'folder'
  conversationId: string
  messageId: string
  totalSize: number
  totalBytes: number
  transferredBytes: number
  progress: number
  fileCount: number
  directoryCount: number
  draftId?: string
  sourceId?: string
  receiveId?: string
  temporaryPath?: string
  finalPath?: string
  localPath?: string
  prepared?: boolean
  offsets?: Record<string, number>
  checkpoints?: Record<string, Array<{ offset: number; sha256: string }>>
  verified?: number[]
  phase?: string
  pauseReason?: string
  desiredState?: 'running' | 'paused'
  error?: string
  cleanupPending?: boolean
  cleanupError?: string
  routeId?: string
  currentFile?: string
  completedFiles?: number
  speedBytesPerSecond?: number
  etaSeconds?: number
  pendingControls?: Array<{ cmd: string; data: Record<string, unknown> }>
  shareState?: string
  content?: NativeP2pAttachmentSummary
  manifest?: NativeP2pManifest
  createdAt?: number
  updatedAt?: number
}

export type NativeTaskPatch = Partial<NativeTask> & { taskId: string }
type StoredTask = Omit<NativeTask, 'manifest'> & { manifestRef?: string }
interface Ledger { version: 2; owner: string; tasks: Record<string, StoredTask> }
interface Token { userId: string; epoch: number }

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)
const finalReceiveStatuses = new Set(['completed', 'cancelled', 'stopped', 'recalled'])

/** Allows UI/control fields only; never trusts a renderer-supplied receive checkpoint or path. */
export function mergeRendererTaskPatch(record: NativeTask, patch: Partial<NativeTask>): NativeTask {
  const allowed = ['status', 'phase', 'pauseReason', 'desiredState', 'error', 'pendingControls', 'shareState'] as const
  const result = { ...record }
  for (const key of allowed) {
    if (record.direction === 'receive' && key === 'status' && patch.status === 'completed' && record.status !== 'completed') continue
    if (own(patch, key)) Object.assign(result, { [key]: copy(patch[key] ?? null) ?? undefined })
  }
  if (record.direction === 'receive' && finalReceiveStatuses.has(record.status)
    && (record.status === 'completed' || !finalReceiveStatuses.has(result.status))) result.status = record.status
  if (result.cleanupPending) result.error = String(result.cleanupError || '临时文件待清理，请恢复原保存位置后重试清理')
  return result
}

/** Account-isolated encrypted task ledger. No task-count eviction is performed. */
export class P2pTaskStorage {
  private activeUserId: string | null = null
  private epoch = 0
  private tail: Promise<unknown> = Promise.resolve()
  private readonly ledgers = new Map<string, Ledger>()

  constructor(private readonly userDataRoot: string) {}

  setAccount(userId: string | null) {
    if (userId !== null && (!userId || userId.length > 256)) throw new Error('传输任务账号无效')
    if (userId !== this.activeUserId) { this.activeUserId = userId; this.epoch++; this.ledgers.clear() }
  }

  async flush() { await this.tail }

  async load(userId: string): Promise<NativeTask[]> {
    this.setAccount(userId)
    const token = this.token(userId)
    return this.serial(async () => {
      this.assertToken(token)
      const ledger = await this.readLedger(token)
      const records: NativeTask[] = []
      for (const record of Object.values(ledger.tasks)) records.push(await this.hydrate(token, record))
      this.assertToken(token)
      return records
    })
  }

  async upsert(userId: string, patch: NativeTaskPatch): Promise<NativeTask> {
    const token = this.token(userId)
    const input = copy(patch)
    for (const key of Object.keys(patch) as Array<keyof NativeTaskPatch>) {
      if (patch[key] === undefined) Object.assign(input, { [key]: undefined })
    }
    this.validateTaskId(input.taskId)
    return this.serial(async () => {
      this.assertToken(token)
      const ledger = await this.readLedger(token)
      const previous = own(ledger.tasks, input.taskId) ? ledger.tasks[input.taskId] : undefined
      if (!previous && (!input.transferId || !input.direction || !input.status)) throw new Error('传输任务记录不完整')
      const { manifest, ...changes } = input
      const now = Date.now()
      const next: StoredTask = {
        name: '', kind: 'file', conversationId: '', messageId: '', totalSize: 0,
        totalBytes: 0, transferredBytes: 0, progress: 0, fileCount: 0, directoryCount: 0,
        createdAt: now, ...previous, ...changes, updatedAt: now,
      } as StoredTask
      if (!['send', 'receive'].includes(next.direction) || !['file', 'folder'].includes(next.kind)) throw new Error('传输任务类型无效')
      if (manifest) {
        const serialized = JSON.stringify(manifest)
        const reference = hash(serialized)
        if (previous?.manifestRef !== reference) {
          await this.writeEncrypted(token, `${reference}.manifest.enc`, { version: 2, owner: hash(userId), manifest })
        }
        next.manifestRef = reference
      }
      const updated: Ledger = { ...ledger, tasks: { ...ledger.tasks, [next.taskId]: next } }
      await this.writeEncrypted(token, 'tasks.enc', updated)
      this.ledgers.set(userId, updated)
      return this.hydrate(token, next)
    })
  }

  async delete(userId: string, taskId: string): Promise<boolean> {
    const token = this.token(userId)
    this.validateTaskId(taskId)
    return this.serial(async () => {
      const ledger = await this.readLedger(token)
      if (!own(ledger.tasks, taskId)) return false
      const tasks = { ...ledger.tasks }
      delete tasks[taskId]
      const updated = { ...ledger, tasks }
      await this.writeEncrypted(token, 'tasks.enc', updated)
      this.ledgers.set(userId, updated)
      return true
    })
  }

  async loadSources(userId: string): Promise<P2pSourceRecord[]> {
    const token = this.token(userId)
    return this.serial(async () => {
      const value = await this.readEncrypted(token, 'sources.enc') as { version?: number; owner?: string; sources?: P2pSourceRecord[] } | undefined
      if (!value) return []
      if (value.version !== 2 || value.owner !== hash(userId) || !Array.isArray(value.sources)) throw new Error('本地发送源记录损坏')
      return copy(value.sources)
    })
  }

  async saveSources(userId: string, sources: P2pSourceRecord[]): Promise<void> {
    const token = this.token(userId)
    const snapshot = copy(sources)
    await this.serial(() => this.writeEncrypted(token, 'sources.enc', { version: 2, owner: hash(userId), sources: snapshot }))
  }

  private token(userId: string): Token {
    if (!userId || this.activeUserId !== userId) throw new Error('传输任务账号已切换')
    return { userId, epoch: this.epoch }
  }

  private assertToken(token: Token) {
    if (token.epoch !== this.epoch || token.userId !== this.activeUserId) throw new Error('传输任务账号已切换')
  }

  private validateTaskId(taskId: string) {
    if (typeof taskId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,200}$/.test(taskId)) throw new Error('传输任务标识无效')
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.tail.catch(() => undefined).then(operation)
    this.tail = pending.catch(() => undefined)
    return pending
  }

  private directory(userId: string) { return join(this.userDataRoot, 'p2p-tasks-v2', hash(userId)) }

  private async readLedger(token: Token): Promise<Ledger> {
    this.assertToken(token)
    const cached = this.ledgers.get(token.userId)
    if (cached) return cached
    const value = await this.readEncrypted(token, 'tasks.enc') as Ledger | undefined
    const ledger = value || { version: 2, owner: hash(token.userId), tasks: {} }
    if (ledger.version !== 2 || ledger.owner !== hash(token.userId) || !ledger.tasks || typeof ledger.tasks !== 'object' || Array.isArray(ledger.tasks)) throw new Error('本地传输任务记录损坏')
    for (const [key, task] of Object.entries(ledger.tasks)) {
      if (!task || key !== task.taskId || !task.transferId) throw new Error('本地传输任务记录损坏')
      this.validateTaskId(key)
    }
    this.ledgers.set(token.userId, ledger)
    return ledger
  }

  private async hydrate(token: Token, record: StoredTask): Promise<NativeTask> {
    const { manifestRef, ...plain } = record
    const result = copy(plain)
    if (manifestRef) {
      if (!/^[a-f0-9]{64}$/.test(manifestRef)) throw new Error('本地文件清单标识无效')
      const value = await this.readEncrypted(token, `${manifestRef}.manifest.enc`) as { version?: number; owner?: string; manifest?: NativeP2pManifest } | undefined
      if (!value?.manifest || value.version !== 2 || value.owner !== hash(token.userId) || hash(JSON.stringify(value.manifest)) !== manifestRef) throw new Error('本地文件清单缺失或损坏')
      return { ...result, manifest: value.manifest }
    }
    this.assertToken(token)
    return result
  }

  private async readEncrypted(token: Token, name: string): Promise<unknown> {
    this.assertToken(token)
    let bytes: Buffer
    try { bytes = await readFile(join(this.directory(token.userId), name)) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
    this.assertToken(token)
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用，无法读取传输任务')
    return JSON.parse(safeStorage.decryptString(bytes))
  }

  private async writeEncrypted(token: Token, name: string, value: unknown): Promise<void> {
    this.assertToken(token)
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储不可用，传输任务未保存')
    const directory = this.directory(token.userId)
    const encrypted = safeStorage.encryptString(JSON.stringify(value))
    await mkdir(directory, { recursive: true })
    this.assertToken(token)
    const destination = join(directory, name)
    const temporary = join(directory, `.${name}.${randomUUID()}.tmp`)
    try {
      const handle = await open(temporary, 'wx', 0o600)
      try { await handle.writeFile(encrypted); await handle.sync() } finally { await handle.close() }
      this.assertToken(token)
      await rename(temporary, destination)
      this.assertToken(token)
    } catch (error) {
      await unlink(temporary).catch(() => undefined)
      throw error
    }
  }
}
