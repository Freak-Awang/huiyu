/**
 * 自定义贴纸管理模块
 *
 * 基于 IndexedDB 存储用户自定义贴纸（图片表情）。
 * 支持添加、列表、重命名、删除操作，限制数量（100个）和大小（5MB/个）。
 * 仅允许 JPG/PNG/GIF/WebP 格式，数据隔离在浏览器本地。
 */
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

/** 打开/创建 IndexedDB 数据库，单例复用连接 */
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

/** 封装 IndexedDB 事务操作 */
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

/**
 * 列出所有自定义贴纸，按更新时间降序排列
 * @returns 贴纸记录列表
 */
export async function listCustomStickerRecords(): Promise<CustomStickerRecord[]> {
  const records = await withStore<CustomStickerRecord[]>('readonly', (store) => store.getAll())
  return (records || []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/**
 * 添加自定义贴纸
 * @param file - 用户选择的图片文件
 * @returns 新创建的贴纸记录
 * @throws 格式不支持、超过大小限制、超过数量上限时抛出错误
 */
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

/**
 * 重命名自定义贴纸
 * @param id - 贴纸ID
 * @param name - 新名称（最多30字）
 */
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

/** 删除自定义贴纸 */
export function deleteCustomStickerRecord(id: string): Promise<void> {
  return withStore('readwrite', (store) => {
    store.delete(id)
  }).then(() => undefined)
}

/** 自定义贴纸限制常量（供 UI 组件引用） */
export const CUSTOM_STICKER_LIMITS = {
  maxCount: MAX_STICKERS,
  maxSize: MAX_STICKER_SIZE,
  accept: 'image/jpeg,image/png,image/gif,image/webp',
}
