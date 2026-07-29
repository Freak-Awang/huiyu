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
    const entry = (item as DataTransferItem & {
      webkitGetAsEntry?: () => { isDirectory?: boolean } | null
    }).webkitGetAsEntry?.()
    return entry?.isDirectory === true
  })
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
