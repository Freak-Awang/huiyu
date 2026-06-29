// ?????customStickers isolates reusable client-side behavior from Vue components.
export interface CustomStickerRecord {
  id: string
  name: string
  blob: Blob
  mimeType: string
  size: number
  createdAt: string
  updatedAt: string
}

const DB_NAME = 'im_custom_stickers'
const DB_VERSION = 1
const STORE_NAME = 'stickers'
const MAX_STICKERS = 100
const MAX_STICKER_SIZE = 5 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return dbPromise
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)
    let request: IDBRequest<T> | void
    transaction.oncomplete = () => resolve(request ? request.result : undefined)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
    request = run(store)
  }))
}

export async function listCustomStickerRecords(): Promise<CustomStickerRecord[]> {
  const records = await withStore<CustomStickerRecord[]>('readonly', (store) => store.getAll())
  return (records || []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function addCustomStickerRecord(file: File): Promise<CustomStickerRecord> {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error('仅支持 JPG、PNG、GIF、WebP 图片')
  }
  if (file.size > MAX_STICKER_SIZE) {
    throw new Error('单个表情不能超过 5MB')
  }
  const existing = await listCustomStickerRecords()
  if (existing.length >= MAX_STICKERS) {
    throw new Error(`最多只能保存 ${MAX_STICKERS} 个自定义表情`)
  }
  const now = new Date().toISOString()
  const record: CustomStickerRecord = {
    id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name.replace(/\.[^.]+$/, '') || '自定义表情',
    blob: file,
    mimeType: file.type,
    size: file.size,
    createdAt: now,
    updatedAt: now,
  }
  await withStore('readwrite', (store) => store.put(record))
  return record
}

export async function renameCustomStickerRecord(id: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('表情名称不能为空')
  }
  const record = await withStore<CustomStickerRecord>('readonly', (store) => store.get(id))
  if (!record) return
  await withStore('readwrite', (store) => store.put({
    ...record,
    name: trimmed.slice(0, 30),
    updatedAt: new Date().toISOString(),
  }))
}

export function deleteCustomStickerRecord(id: string): Promise<void> {
  return withStore('readwrite', (store) => {
    store.delete(id)
  }).then(() => undefined)
}

export const CUSTOM_STICKER_LIMITS = {
  maxCount: MAX_STICKERS,
  maxSize: MAX_STICKER_SIZE,
  accept: 'image/jpeg,image/png,image/gif,image/webp',
}
