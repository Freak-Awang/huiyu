import { isAbsolute, relative, resolve } from 'node:path'

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

/** Normalize a sender-controlled folder path without allowing traversal or device names. */
export function safeP2pRelativePath(value: string) {
  const normalized = String(value || '').replace(/\\/g, '/')
  if (!normalized || normalized.startsWith('/') || isAbsolute(normalized) || /^[a-z]:\//i.test(normalized)) {
    throw new Error('Invalid folder path')
  }
  const parts = normalized.split('/').map((part) => part.normalize('NFC'))
  if (parts.some((part) => !part || part === '.' || part === '..'
    || /[<>:"|?*\u0000-\u001f]/.test(part) || WINDOWS_RESERVED.test(part)
    || /[. ]$/.test(part))) {
    throw new Error('Unsafe folder path')
  }
  return parts.join('/')
}

/** Resolve a normalized entry and prove that it stays below the selected temporary root. */
export function resolveP2pEntryPath(root: string, value: string) {
  const normalized = safeP2pRelativePath(value)
  const path = resolve(root, normalized)
  const confined = relative(root, path)
  if (!confined || confined.startsWith('..') || isAbsolute(confined)) {
    throw new Error('P2P folder path escapes destination')
  }
  return path
}

/** Enforce ordered, non-empty, bounded writes before touching a file handle. */
export function assertP2pWriteBounds(
  declaredSize: number,
  expectedOffset: number,
  requestedOffset: number,
  chunkSize: number,
  maxChunkSize: number,
) {
  if (!Number.isSafeInteger(expectedOffset) || !Number.isSafeInteger(requestedOffset)
    || requestedOffset !== expectedOffset || !Number.isSafeInteger(chunkSize)
    || chunkSize <= 0 || chunkSize > maxChunkSize
    || expectedOffset + chunkSize > declaredSize) {
    throw new Error('Invalid P2P write request')
  }
}
