import { shallowRef } from 'vue'
import type { ContextMenuItem } from './types'
import { readableSelection } from '../../features/emoji/utils/emojiSerializer'

interface MenuSession {
  id: number
  x: number
  y: number
  label: string
  items: () => ContextMenuItem[]
  restoreFocus: HTMLElement | null
}

// One host in Chat.vue; every surface shares this single session.
const session = shallowRef<MenuSession | null>(null)
let sequence = 0
export function closeContextMenu(restoreFocus = false) {
  const previous = session.value
  session.value = null
  if (restoreFocus && previous?.restoreFocus?.isConnected) previous.restoreFocus.focus({ preventScroll: true })
}

export function openContextMenu(event: MouseEvent, items: ContextMenuItem[] | (() => ContextMenuItem[]), label = '操作菜单') {
  const build = typeof items === 'function' ? items : () => items
  if (!build().some(item => item.visible !== false)) return
  event.preventDefault()
  event.stopPropagation()
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const rect = target?.getBoundingClientRect()
  session.value = {
    id: ++sequence,
    x: event.clientX || rect?.left || 0,
    y: event.clientY || rect?.bottom || 0,
    label,
    items: build,
    restoreFocus: target?.matches('input, textarea, button, [tabindex]') ? target : focused,
  }
}

/** Capture before a menu takes focus. A selection from another message is never copied. */
export function selectedMessageText(element: HTMLElement): string {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.rangeCount) return ''
  const range = selection.getRangeAt(0)
  if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return ''
  return readableSelection(element) || ''
}

export function useContextMenu() { return { session, openContextMenu, closeContextMenu } }
