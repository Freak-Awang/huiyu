/**
 * 文件拖放工具
 *
 * 提供浏览器拖放事件的处理工具：
 * - 判断拖放载荷是否包含文件
 * - 检测拖放是否包含目录
 * - 嵌套拖放深度追踪器（DragDepthTracker）：解决嵌套 DOM 元素 dragenter/dragleave 闪烁问题
 */
/**
 * 判断拖放事件是否包含文件载荷（而非文本拖拽）
 * @param dataTransfer - 拖放事件的数据传输对象
 */
export function hasFileDragPayload(dataTransfer?: Pick<DataTransfer, 'types'> | null) {
  return !!dataTransfer && Array.from(dataTransfer.types || []).includes('Files')
}

/**
 * 检测拖放项中是否包含目录
 * @param items - 拖放项列表
 */
export function hasDirectoryDragItem(items?: DataTransferItemList | null) {
  if (!items) return false
  return Array.from(items).some((item) => {
    const entry = getEntryFromItem(item)
    return entry?.isDirectory === true
  })
}

/** FileSystemEntry 的最小结构定义（兼容 webkitGetAsEntry 返回值） */
type FileSystemEntryLike = {
  isFile: boolean
  isDirectory: boolean
  name: string
  file?: (success: (file: File) => void, error?: (err: unknown) => void) => void
  createReader?: () => {
    readEntries: (
      success: (entries: FileSystemEntryLike[]) => void,
      error?: (err: unknown) => void,
    ) => void
  }
}

function getEntryFromItem(item: DataTransferItem): FileSystemEntryLike | null {
  return (
    (item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntryLike | null })
      .webkitGetAsEntry?.() ?? null
  )
}

function readEntryFile(entry: FileSystemEntryLike): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file?.(resolve, () => resolve(null))
  })
}

// readEntries 每次最多返回 100 条，需循环读取直到返回空批次
function readEntryBatch(reader: ReturnType<NonNullable<FileSystemEntryLike['createReader']>>) {
  return new Promise<FileSystemEntryLike[]>((resolve) => {
    reader.readEntries(resolve, () => resolve([]))
  })
}

/** 拖入的文件夹：名称 + 带相对路径的文件列表 */
export interface DroppedFolder {
  name: string
  files: { path: string; file: File }[]
}

/** 拖放收集结果：顶层散文件 + 文件夹列表 */
export interface DroppedItems {
  files: File[]
  folders: DroppedFolder[]
}

async function walkEntry(
  entry: FileSystemEntryLike,
  output: { path: string; file: File }[],
  prefix: string,
) {
  if (entry.isFile && entry.file) {
    const file = await readEntryFile(entry)
    if (file) output.push({ path: prefix + file.name, file })
    return
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader()
    let batch: FileSystemEntryLike[]
    do {
      batch = await readEntryBatch(reader)
      for (const child of batch) await walkEntry(child, output, `${prefix}${entry.name}/`)
    } while (batch.length > 0)
  }
}

async function walkRootDirectory(
  entry: FileSystemEntryLike,
  output: { path: string; file: File }[],
) {
  if (!entry.createReader) return
  const reader = entry.createReader()
  let batch: FileSystemEntryLike[]
  do {
    batch = await readEntryBatch(reader)
    for (const child of batch) await walkEntry(child, output, '')
  } while (batch.length > 0)
}

/**
 * 收集拖放载荷，区分顶层散文件与文件夹（文件夹递归展开并保留相对路径）
 *
 * 必须在拖放事件处理函数中同步调用（内部会同步读取 dataTransfer.items），
 * 之后异步遍历目录。不支持 entries API 的环境回退到 dataTransfer.files（全部视为散文件）。
 * @param dataTransfer - 拖放事件的数据传输对象
 */
export async function collectDroppedItems(dataTransfer?: DataTransfer | null): Promise<DroppedItems> {
  if (!dataTransfer) return { files: [], folders: [] }
  const entries = Array.from(dataTransfer.items || [])
    .filter((item) => item.kind === 'file')
    .map(getEntryFromItem)
    .filter((entry): entry is FileSystemEntryLike => !!entry)

  if (!entries.length) return { files: Array.from(dataTransfer.files || []), folders: [] }

  const result: DroppedItems = { files: [], folders: [] }
  for (const entry of entries) {
    if (entry.isDirectory) {
      const folder: DroppedFolder = { name: entry.name, files: [] }
      await walkRootDirectory(entry, folder.files)
      result.folders.push(folder)
    } else if (entry.isFile && entry.file) {
      const file = await readEntryFile(entry)
      if (file) result.files.push(file)
    }
  }
  return result
}

/**
 * 嵌套拖放深度追踪器
 *
 * 解决嵌套 DOM 元素触发多次 dragenter/dragleave 导致 UI 闪烁的问题。
 * 使用计数器追踪拖放深度，仅在深度从 0 变为 1（真正进入）或从 1 变为 0（真正离开）时切换 UI。
 */
export class DragDepthTracker {
  private depth = 0

  /** 进入拖放区域，返回当前深度 */
  enter() {
    this.depth += 1
    return this.depth
  }

  /** 离开拖放区域，返回当前深度 */
  leave() {
    this.depth = Math.max(0, this.depth - 1)
    return this.depth
  }

  /** 重置深度（用于异常恢复） */
  reset() {
    this.depth = 0
  }
}
