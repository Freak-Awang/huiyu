export const EMOJI_CELL_SIZE = 44
export function emojiGridWindow(count: number, width: number, height: number, scrollTop: number, overscan = 4) {
  const columns = Math.max(1, Math.floor(width / EMOJI_CELL_SIZE))
  const totalRows = Math.ceil(count / columns)
  const top = Math.max(0, Math.min(scrollTop, Math.max(0, totalRows * EMOJI_CELL_SIZE - height)))
  const startRow = Math.max(0, Math.floor(top / EMOJI_CELL_SIZE) - overscan)
  const endRow = Math.min(totalRows, Math.ceil((top + height) / EMOJI_CELL_SIZE) + overscan)
  return { columns, totalHeight: totalRows * EMOJI_CELL_SIZE, offset: startRow * EMOJI_CELL_SIZE, start: startRow * columns, end: Math.min(count, endRow * columns) }
}
