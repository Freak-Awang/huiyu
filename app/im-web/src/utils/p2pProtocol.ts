import { hashFile } from './fileHash'

export const P2P_PROTOCOL_VERSION = 2 as const
export const P2P_CHUNK_SIZE = 64 * 1024
export const P2P_ACK_WINDOW = 4 * 1024 * 1024
export const P2P_BUFFER_HIGH_WATER = 8 * 1024 * 1024
export const P2P_BUFFER_LOW_WATER = 4 * 1024 * 1024
export const P2P_MAX_FOLDER_FILES = 10_000
export const P2P_MAX_FOLDER_DIRECTORIES = 10_000
export const P2P_MANIFEST_TEXT_CHUNK = 12 * 1024
export const P2P_MAX_MANIFEST_TEXT = 16 * 1024 * 1024

export interface P2pManifestEntry {
  index: number
  path: string
  name: string
  size: number
  contentType: string
  sha256: string
}

export interface P2pManifest {
  version: 1 | 2
  kind: 'file' | 'folder'
  name: string
  totalSize: number
  fileCount: number
  files: P2pManifestEntry[]
  directories?: string[]
  manifestSha256: string
}

export interface P2pAttachmentContent {
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

export interface P2pSourceFile {
  entry: P2pManifestEntry
  file?: File
}

export interface PreparedP2pSource {
  manifest: P2pManifest
  files: P2pSourceFile[]
  sourceId?: string
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

function utf8(value: string) {
  return new TextEncoder().encode(value)
}

function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (value) => value.toString(16).padStart(2, '0')).join('')
}

export async function sha256Text(value: string) {
  return hex(await crypto.subtle.digest('SHA-256', utf8(value)))
}

/** Normalize an untrusted folder-relative path and reject traversal/Windows device names. */
export function normalizeP2pRelativePath(rawPath: string, rootName?: string) {
  let value = String(rawPath || '').replace(/\\/g, '/').replace(/^\.\//, '')
  const normalizedRoot = String(rootName || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  if (normalizedRoot && value.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)) {
    value = value.slice(normalizedRoot.length + 1)
  }
  if (!value || value.startsWith('/') || /^[a-z]:\//i.test(value)) {
    throw new Error('文件夹包含无效的绝对路径')
  }
  const parts = value.split('/').map((part) => part.normalize('NFC'))
  if (parts.some((part) => !part || part === '.' || part === '..'
    || part.includes('\0') || WINDOWS_RESERVED.test(part) || /[<>:"|?*]/.test(part)
    || /[. ]$/.test(part))) {
    throw new Error(`文件夹包含不安全路径：${rawPath}`)
  }
  return parts.join('/')
}

function manifestPayload(manifest: Omit<P2pManifest, 'manifestSha256'>) {
  return JSON.stringify({
    version: manifest.version,
    kind: manifest.kind,
    name: manifest.name,
    totalSize: manifest.totalSize,
    fileCount: manifest.fileCount,
    ...(manifest.version === 2 ? { directories: manifest.directories || [] } : {}),
    files: manifest.files.map((entry) => ({
      index: entry.index,
      path: entry.path,
      name: entry.name,
      size: entry.size,
      contentType: entry.contentType,
      sha256: entry.sha256,
    })),
  })
}

export async function verifyP2pManifest(manifest: P2pManifest) {
  const { manifestSha256: _hash, ...payload } = manifest
  return await sha256Text(manifestPayload(payload)) === manifest.manifestSha256
}

async function finishManifest(
  kind: 'file' | 'folder',
  name: string,
  files: P2pSourceFile[],
  directories: string[] = [],
): Promise<PreparedP2pSource> {
  const totalSize = files.reduce((sum, item) => sum + item.entry.size, 0)
  const base: Omit<P2pManifest, 'manifestSha256'> = {
    version: P2P_PROTOCOL_VERSION,
    kind,
    name,
    totalSize,
    fileCount: files.length,
    directories,
    files: files.map((item) => item.entry),
  }
  const manifest: P2pManifest = {
    ...base,
    manifestSha256: await sha256Text(manifestPayload(base)),
  }
  return { manifest, files }
}

export async function prepareP2pFile(
  file: File,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
) {
  if (!Number.isSafeInteger(file.size) || file.size < 0) {
    throw new Error('文件大小无效')
  }
  const sha256 = await hashFile(file, onProgress, signal)
  const entry: P2pManifestEntry = {
    index: 0,
    path: file.name || 'file',
    name: file.name || 'file',
    size: file.size,
    contentType: file.type || 'application/octet-stream',
    sha256,
  }
  return finishManifest('file', entry.name, [{ entry, file }])
}

export async function prepareP2pFolder(
  folderName: string,
  input: Array<{ path: string; file: File }>,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
  directoryPaths: string[] = [],
) {
  if (input.length > P2P_MAX_FOLDER_FILES) {
    throw new Error(`文件夹文件数不能超过 ${P2P_MAX_FOLDER_FILES}`)
  }
  const normalized = input.map(({ path, file }) => ({
    path: normalizeP2pRelativePath(path, folderName),
    file,
  })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
  const paths = new Set<string>()
  let totalSize = 0
  for (const item of normalized) {
    if (!Number.isSafeInteger(item.file.size) || item.file.size < 0) {
      throw new Error(`${item.path} 文件大小无效`)
    }
    totalSize += item.file.size
    if (!Number.isSafeInteger(totalSize)) throw new Error('文件夹总大小超出可精确表示的范围')
  }
  let hashedBytes = 0
  const files: P2pSourceFile[] = []
  for (const [index, item] of normalized.entries()) {
    if (paths.has(item.path.toLowerCase())) throw new Error(`文件夹包含重复路径：${item.path}`)
    paths.add(item.path.toLowerCase())
    const sha256 = await hashFile(item.file, (progress) => {
      onProgress?.(totalSize ? (hashedBytes + item.file.size * progress) / totalSize : 0)
    }, signal)
    hashedBytes += item.file.size
    files.push({
      file: item.file,
      entry: {
        index,
        path: item.path,
        name: item.file.name || item.path.split('/').pop() || 'file',
        size: item.file.size,
        contentType: item.file.type || 'application/octet-stream',
        sha256,
      },
    })
  }
  onProgress?.(1)
  const directories = new Set(directoryPaths.map((path) => normalizeP2pRelativePath(path, folderName)))
  for (const item of normalized) {
    const parts = item.path.split('/')
    for (let index = 1; index < parts.length; index++) directories.add(parts.slice(0, index).join('/'))
  }
  if (directories.size > P2P_MAX_FOLDER_DIRECTORIES) throw new Error('文件夹目录数超过 10000')
  const prepared = await finishManifest('folder', folderName || 'folder', files, [...directories].sort())
  validateP2pManifestStructure(prepared.manifest)
  return prepared
}

export function p2pOfferSummary(source: PreparedP2pSource) {
  const { manifest } = source
  return {
    version: manifest.version,
    kind: manifest.kind,
    name: manifest.name,
    totalSize: manifest.totalSize,
    fileCount: manifest.fileCount,
    directoryCount: manifest.directories?.length || 0,
    ...(manifest.kind === 'file'
      ? { sha256: manifest.files[0].sha256 }
      : { manifestSha256: manifest.manifestSha256 }),
  }
}

/** Split a potentially large folder manifest into ordered DataChannel control messages. */
export function splitP2pManifest(manifest: P2pManifest) {
  const serialized = JSON.stringify(manifest)
  if (serialized.length > P2P_MAX_MANIFEST_TEXT) throw new Error('P2P 文件清单过大')
  const parts: string[] = []
  for (let offset = 0; offset < serialized.length; offset += P2P_MANIFEST_TEXT_CHUNK) {
    parts.push(serialized.slice(offset, offset + P2P_MANIFEST_TEXT_CHUNK))
  }
  return parts
}

/** Binary frame: uint32 file index + uint64 offset + uint32 payload size + payload. */
export function encodeP2pDataFrame(fileIndex: number, offset: number, payload: ArrayBuffer) {
  if (!Number.isInteger(fileIndex) || fileIndex < 0 || fileIndex >= P2P_MAX_FOLDER_FILES
    || !Number.isSafeInteger(offset) || offset < 0
    || payload.byteLength <= 0 || payload.byteLength > P2P_CHUNK_SIZE
    || !Number.isSafeInteger(offset + payload.byteLength)) throw new Error('无效的 P2P 数据帧')
  const frame = new ArrayBuffer(16 + payload.byteLength)
  const view = new DataView(frame)
  view.setUint32(0, fileIndex, true)
  view.setBigUint64(4, BigInt(offset), true)
  view.setUint32(12, payload.byteLength, true)
  new Uint8Array(frame, 16).set(new Uint8Array(payload))
  return frame
}

export function decodeP2pDataFrame(frame: ArrayBuffer) {
  if (frame.byteLength < 16) throw new Error('无效的 P2P 数据帧')
  const view = new DataView(frame)
  const size = view.getUint32(12, true)
  if (size !== frame.byteLength - 16) throw new Error('P2P 数据帧长度不匹配')
  const offset = view.getBigUint64(4, true)
  if (view.getUint32(0, true) >= P2P_MAX_FOLDER_FILES || size <= 0 || size > P2P_CHUNK_SIZE
    || offset + BigInt(size) > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('无效的 P2P 数据帧偏移或大小')
  return {
    fileIndex: view.getUint32(0, true),
    offset: Number(offset),
    payload: frame.slice(16),
  }
}

export function parseP2pAttachmentContent(content: string): P2pAttachmentContent | null {
  try {
    const value = JSON.parse(content) as P2pAttachmentContent
    if ((value?.version === 1 || value?.version === 2) && value.transferMode === 'p2p_lan'
      && /^p2p_[a-z0-9]+$/i.test(value.transferId)
      && (value.kind === 'file' || value.kind === 'folder')
      && typeof value.name === 'string' && value.name.length > 0
      && Number.isSafeInteger(value.totalSize) && value.totalSize >= (value.version === 1 ? 1 : 0)
      && Number.isInteger(value.fileCount) && value.fileCount >= (value.version === 1 ? 1 : 0)
      && value.fileCount <= P2P_MAX_FOLDER_FILES
      && (value.kind !== 'file' || value.fileCount === 1)
      && (value.version !== 2 || (Number.isInteger(value.directoryCount) && value.directoryCount! >= 0
        && value.directoryCount! <= P2P_MAX_FOLDER_DIRECTORIES))) {
      return value
    }
  } catch {
    // Invalid legacy/user content is not a P2P attachment.
  }
  return null
}

/** Validate the complete tree before allocating files. No malformed entry may be skipped. */
export function validateP2pManifestStructure(manifest: P2pManifest) {
  if (![1, 2].includes(manifest.version) || !['file', 'folder'].includes(manifest.kind)
    || !Array.isArray(manifest.files) || manifest.files.length !== manifest.fileCount
    || manifest.fileCount > P2P_MAX_FOLDER_FILES || !Number.isSafeInteger(manifest.totalSize)
    || manifest.totalSize < 0
    || (manifest.kind === 'file' && manifest.fileCount !== 1)
    || (manifest.version === 1 && (manifest.totalSize <= 0 || manifest.fileCount <= 0))) {
    throw new Error('P2P 文件清单数量或大小无效')
  }
  const directories = manifest.version === 2 ? manifest.directories : []
  if (!Array.isArray(directories) || directories.length > P2P_MAX_FOLDER_DIRECTORIES
    || (manifest.kind === 'file' && directories.length)) throw new Error('P2P 目录清单无效')
  const paths = new Map<string, 'file' | 'directory'>()
  for (const path of directories) {
    const safe = normalizeP2pRelativePath(path)
    if (safe !== path || paths.has(safe.toLowerCase())) throw new Error(`P2P 目录路径冲突：${path}`)
    paths.set(safe.toLowerCase(), 'directory')
  }
  let total = 0
  for (const [index, entry] of manifest.files.entries()) {
    const safe = normalizeP2pRelativePath(entry.path)
    if (safe !== entry.path || entry.index !== index || !Number.isSafeInteger(entry.size)
      || entry.size < (manifest.version === 1 ? 1 : 0)
      || !/^[a-f0-9]{64}$/i.test(entry.sha256) || paths.has(safe.toLowerCase())) {
      throw new Error(`P2P 文件条目无效：${entry.path}`)
    }
    paths.set(safe.toLowerCase(), 'file')
    total += entry.size
    if (!Number.isSafeInteger(total)) throw new Error('P2P 文件清单总大小无效')
  }
  if (total !== manifest.totalSize) throw new Error('P2P 文件清单总大小不一致')
  for (const path of paths.keys()) {
    const parts = path.split('/')
    for (let index = 1; index < parts.length; index++) {
      const parent = parts.slice(0, index).join('/')
      if (paths.get(parent) === 'file' || (manifest.version === 2 && !paths.has(parent))) {
        throw new Error(`P2P 父目录无效：${path}`)
      }
    }
  }
}
