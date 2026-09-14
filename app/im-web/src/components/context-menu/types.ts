export interface ContextMenuItem {
  id: string
  label: string
  icon?: string
  danger?: boolean
  disabled?: boolean
  visible?: boolean
  separatorBefore?: boolean
  shortcut?: string
  children?: ContextMenuItem[]
  action?: () => void | Promise<unknown>
}

export interface MenuAnchor { x: number; y: number; right?: number; bottom?: number }

export function positionMenu(anchor: MenuAnchor, width: number, height: number, viewportWidth: number, viewportHeight: number) {
  const margin = 6
  const flipX = (anchor.right ?? anchor.x) + width > viewportWidth - margin
  const flipY = anchor.y + height > viewportHeight - margin
  return {
    x: Math.max(margin, Math.min(flipX ? anchor.x - width : anchor.right ?? anchor.x, viewportWidth - width - margin)),
    y: Math.max(margin, Math.min(flipY ? (anchor.bottom ?? anchor.y) - height : anchor.y, viewportHeight - height - margin)),
    origin: `${flipX ? 'right' : 'left'} ${flipY ? 'bottom' : 'top'}`,
  }
}

export function nextEnabledItem(items: ContextMenuItem[], current: number, direction: number) {
  for (let step = 1; step <= items.length; step++) {
    const index = (current + direction * step + items.length) % items.length
    if (!items[index]?.disabled && items[index]?.visible !== false) return index
  }
  return -1
}
