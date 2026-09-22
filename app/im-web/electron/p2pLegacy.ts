import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { listLocalP2pMessages, type LocalMessageRecord } from './localMessages.js'
import { P2pTaskStorage, type NativeP2pAttachmentSummary, type NativeTask } from './p2pTaskStorage.js'

function summaryFrom(message: LocalMessageRecord): NativeP2pAttachmentSummary | undefined {
  let value: Partial<NativeP2pAttachmentSummary>
  try { value = JSON.parse(message.content) as Partial<NativeP2pAttachmentSummary> } catch { return undefined }
  if (!value || ![1, 2].includes(value.version || 0) || value.transferMode !== 'p2p_lan'
    || typeof value.transferId !== 'string' || !/^p2p_[a-z0-9]+$/i.test(value.transferId)
    || !['file', 'folder'].includes(value.kind || '') || typeof value.name !== 'string' || !value.name
    || !Number.isSafeInteger(value.totalSize) || value.totalSize! < 0
    || !Number.isInteger(value.fileCount) || value.fileCount! < 0
    || (value.version === 1 && (value.totalSize! <= 0 || value.fileCount! <= 0))
    || (value.kind === 'file' && (message.messageType !== 'FILE' || value.fileCount !== 1))
    || (value.kind === 'folder' && (message.messageType !== 'FOLDER' || value.fileCount! > 10_000))) return undefined
  const checksum = value.kind === 'file' ? value.sha256 : value.manifestSha256
  if (typeof checksum !== 'string' || !/^[a-f0-9]{64}$/i.test(checksum)) return undefined
  const directoryCount = value.directoryCount ?? 0
  if (!Number.isInteger(directoryCount) || directoryCount < 0 || directoryCount > 10_000) return undefined
  return {
    version: value.version as 1 | 2, transferMode: 'p2p_lan', transferId: value.transferId,
    kind: value.kind as 'file' | 'folder', name: value.name, totalSize: value.totalSize!,
    fileCount: value.fileCount!, directoryCount,
    ...(value.kind === 'file' ? { sha256: value.sha256 } : { manifestSha256: value.manifestSha256 }),
    ...(typeof value.fileName === 'string' ? { fileName: value.fileName } : {}),
    ...(typeof value.fileSize === 'number' ? { fileSize: value.fileSize } : {}),
    ...(typeof value.folderName === 'string' ? { folderName: value.folderName } : {}),
  }
}

/**
 * A global legacy path is not sufficient authorization to show a received file.
 * Require the logged-in account's original received message before importing it.
 * Never deletes the legacy registry or scans the registered directory contents.
 */
export async function migrateLegacyP2pResults(
  userId: string,
  userDataRoot: string,
  storage: P2pTaskStorage,
): Promise<NativeTask[]> {
  if (!userId) return []
  const existing = await storage.load(userId)
  let index: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(await readFile(join(userDataRoot, 'p2p-completed-paths.json'), 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
    index = parsed as Record<string, unknown>
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return []
    throw error
  }
  const messages = await listLocalP2pMessages(userId)
  const candidates = new Map<string, { message: LocalMessageRecord; content: NativeP2pAttachmentSummary }>()
  const rejected = new Set<string>()
  for (const message of messages) {
    const content = summaryFrom(message)
    if (!content) continue
    if (String(message.status || '').toUpperCase() === 'RECALLED') { rejected.add(content.transferId); continue }
    if (!message.senderId || String(message.senderId) === userId || !message.messageId || !message.conversationId) continue
    const previous = candidates.get(content.transferId)
    if (previous && (previous.message.messageId !== message.messageId || previous.message.conversationId !== message.conversationId
      || previous.message.senderId !== message.senderId || JSON.stringify(previous.content) !== JSON.stringify(content))) {
      rejected.add(content.transferId)
      continue
    }
    candidates.set(content.transferId, { message, content })
  }

  const occupiedTransfers = new Set(existing.filter((record) => record.direction === 'receive').map((record) => record.transferId))
  const occupiedTasks = new Set(existing.map((record) => record.taskId))
  const migrated: NativeTask[] = []
  for (const [transferId, { message, content }] of candidates) {
    const taskId = `legacy_${transferId}`
    if (rejected.has(transferId) || occupiedTransfers.has(transferId) || occupiedTasks.has(taskId)) continue
    const path = Object.prototype.hasOwnProperty.call(index, transferId) ? index[transferId] : undefined
    if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) continue
    try {
      const metadata = await stat(path)
      if (content.kind === 'file' ? (!metadata.isFile() || metadata.size !== content.totalSize) : !metadata.isDirectory()) continue
    } catch { continue }
    const createdAt = Date.parse(message.createdAt)
    const record = await storage.upsert(userId, {
      taskId, transferId, direction: 'receive', status: 'completed', phase: 'completed',
      conversationId: message.conversationId, messageId: message.messageId,
      name: content.name, kind: content.kind, totalSize: content.totalSize, totalBytes: content.totalSize,
      transferredBytes: content.totalSize, progress: 1, fileCount: content.fileCount,
      directoryCount: content.directoryCount || 0, completedFiles: content.fileCount,
      finalPath: path, localPath: path, content, desiredState: 'paused',
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    })
    migrated.push(record)
    occupiedTasks.add(taskId)
    occupiedTransfers.add(transferId)
  }
  return migrated
}
