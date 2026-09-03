import { hashFile } from './fileHash'

export const P2P_PROTOCOL_VERSION = 1 as const
export const P2P_CHUNK_SIZE = 64 * 1024
export const P2P_ACK_WINDOW = 4 * 1024 * 1024
export const P2P_BUFFER_HIGH_WATER = 8 * 1024 * 1024
export const P2P_BUFFER_LOW_WATER = 4 * 1024 * 1024
export const P2P_MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024
export const P2P_MAX_FOLDER_SIZE = 20 * 1024 * 1024 * 1024
export const P2P_MAX_FOLDER_FILES = 10_000
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
  version: 1
  kind: 'file' | 'folder'
  name: string
  totalSize: number
  fileCount: number
  files: P2pManifestEntry[]
  manifestSha256: string
}

export interface P2pAttachmentContent {
  version: 1
  transferMode: 'p2p_lan'
  transferId: string
  kind: 'file' | 'folder'
  name: string
  totalSize: number
  fileCount: number
  sha256?: string
  manifestSha256?: string
  fileName?: string
  fileSize?: number
  folderName?: string
}

export interface P2pSourceFile {
  entry: P2pManifestEntry
  file: File
}

export interface PreparedP2pSource {
  manifest: P2pManifest
  files: P2pSourceFile[]
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
): Promise<PreparedP2pSource> {
  const totalSize = files.reduce((sum, item) => sum + item.entry.size, 0)
  const base: Omit<P2pManifest, 'manifestSha256'> = {
    version: P2P_PROTOCOL_VERSION,
    kind,
    name,
    totalSize,
    fileCount: files.length,
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
  if (file.size <= 0 || file.size > P2P_MAX_FILE_SIZE) {
    throw new Error('文件为空或超过 2GB')
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
) {
  if (!input.length || input.length > P2P_MAX_FOLDER_FILES) {
    throw new Error(`文件夹文件数必须在 1～${P2P_MAX_FOLDER_FILES} 之间`)
  }
  const normalized = input.map(({ path, file }) => ({
    path: normalizeP2pRelativePath(path, folderName),
    file,
  })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
  const paths = new Set<string>()
  const totalSize = normalized.reduce((sum, item) => sum + item.file.size, 0)
  if (totalSize <= 0 || totalSize > P2P_MAX_FOLDER_SIZE) {
    throw new Error('文件夹为空或总大小超过 20GB')
  }
  let hashedBytes = 0
  const files: P2pSourceFile[] = []
  for (const [index, item] of normalized.entries()) {
    if (paths.has(item.path.toLowerCase())) throw new Error(`文件夹包含重复路径：${item.path}`)
    paths.add(item.path.toLowerCase())
    if (item.file.size <= 0 || item.file.size > P2P_MAX_FILE_SIZE) {
      throw new Error(`${item.path} 为空或超过 2GB`)
    }
    const sha256 = await hashFile(item.file, (progress) => {
      onProgress?.((hashedBytes + item.file.size * progress) / totalSize)
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
  return finishManifest('folder', folderName || 'folder', files)
}

export function p2pOfferSummary(source: PreparedP2pSource) {
  const { manifest } = source
  return {
    kind: manifest.kind,
    name: manifest.name,
    totalSize: manifest.totalSize,
    fileCount: manifest.fileCount,
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
  return {
    fileIndex: view.getUint32(0, true),
    offset: Number(view.getBigUint64(4, true)),
    payload: frame.slice(16),
  }
}

export function parseP2pAttachmentContent(content: string): P2pAttachmentContent | null {
  try {
    const value = JSON.parse(content) as P2pAttachmentContent
    if (value?.version === 1 && value.transferMode === 'p2p_lan'
      && /^p2p_[a-z0-9]+$/i.test(value.transferId)
      && (value.kind === 'file' || value.kind === 'folder')
      && typeof value.name === 'string' && value.name.length > 0
      && Number.isFinite(value.totalSize) && value.totalSize > 0
      && Number.isInteger(value.fileCount) && value.fileCount > 0) {
      return value
    }
  } catch {
    // Invalid legacy/user content is not a P2P attachment.
  }
  return null
}
