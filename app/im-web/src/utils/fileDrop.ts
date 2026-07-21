// Intent: fileDrop centralizes browser drag payload checks and flicker-free nested drag depth tracking.
export function hasFileDragPayload(dataTransfer?: Pick<DataTransfer, 'types'> | null) {
  return !!dataTransfer && Array.from(dataTransfer.types || []).includes('Files')
}

export function hasDirectoryDragItem(items?: DataTransferItemList | null) {
  if (!items) return false
  return Array.from(items).some((item) => {
    const entry = (item as DataTransferItem & {
      webkitGetAsEntry?: () => { isDirectory?: boolean } | null
    }).webkitGetAsEntry?.()
    return entry?.isDirectory === true
  })
}

export class DragDepthTracker {
  private depth = 0

  enter() {
    this.depth += 1
    return this.depth
  }

  leave() {
    this.depth = Math.max(0, this.depth - 1)
    return this.depth
  }

  reset() {
    this.depth = 0
  }
}
