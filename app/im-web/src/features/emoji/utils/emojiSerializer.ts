import { EMOJI_FALLBACK, EMOJI_ID_PATTERN } from '../constants'
import { getEmojiById } from '../composables/useEmojiCatalog'
import { emojiToken, emojiToPlainText } from './emojiMessage'
import { parseEmojiMessage } from './emojiParser'
import { getBuiltinEmojiUrl } from './emojiUrl'

/** Never interpret message text as HTML. Only these locally constructed elements enter the editor. */
export function createComposerEmoji(id: string, doc: Document): HTMLSpanElement {
  const token = doc.createElement('span')
  token.contentEditable = 'false'
  token.draggable = false
  token.dataset.emojiId = id
  token.className = 'composer-emoji-token'
  const emoji = getEmojiById(id)
  token.setAttribute('aria-label', emoji?.label || '表情')
  if (!emoji) { token.textContent = EMOJI_FALLBACK; return token }
  const image = doc.createElement('img')
  image.src = getBuiltinEmojiUrl(emoji.file)
  image.alt = EMOJI_FALLBACK
  image.title = emoji.label || '表情'
  image.loading = 'lazy'
  image.decoding = 'async'
  image.draggable = false
  image.addEventListener('error', () => {
    token.textContent = EMOJI_FALLBACK
    if (import.meta.env.DEV) console.warn('Emoji image unavailable', id, emoji.file)
  }, { once: true })
  token.append(image)
  return token
}

export function createEmojiFragment(text: string, doc: Document): DocumentFragment {
  const fragment = doc.createDocumentFragment()
  for (const segment of parseEmojiMessage(text)) {
    fragment.append(segment.type === 'text' ? doc.createTextNode(segment.text) : createComposerEmoji(segment.id, doc))
  }
  return fragment
}

export function hydrateFromSerializedMessage(root: HTMLElement, text: string): void {
  root.replaceChildren(createEmojiFragment(text, root.ownerDocument))
  ensureComposerCaretLine(root)
}

/** A zero-length trailing BR lets Chromium position the caret on the last empty line. */
export function ensureComposerCaretLine(root: HTMLElement): void {
  root.querySelectorAll('[data-composer-caret]').forEach(node => node.remove())
  if (root.lastChild?.textContent?.endsWith('\n') || (root.lastChild instanceof HTMLElement && root.lastChild.dataset.emojiId)) {
    const caret = root.ownerDocument.createElement('br')
    caret.dataset.composerCaret = ''
    root.append(caret)
  }
}

export function serializeComposer(root: Node): string {
  if (root.nodeType === 3) return root.textContent || ''
  if (root instanceof Element) {
    const id = root.getAttribute('data-emoji-id')
    if (id && EMOJI_ID_PATTERN.test(id)) return emojiToken(id)
    if (root.hasAttribute('data-composer-caret')) return ''
    if (root.tagName === 'BR') return '\n'
  }
  const children = Array.from(root.childNodes)
  // Chromium's empty editable/block placeholder does not mean a user-entered newline.
  if (children.length === 1 && children[0] instanceof Element && children[0].tagName === 'BR') return ''
  let text = ''
  children.forEach((child, index) => {
    const block = child instanceof Element && /^(DIV|P|LI)$/.test(child.tagName)
    if (block && index > 0 && !text.endsWith('\n')) text += '\n'
    text += serializeComposer(child)
    if (block && index < children.length - 1 && !text.endsWith('\n')) text += '\n'
  })
  return text
}

export function serializedRangeOffsets(root: HTMLElement, range: Range): { start: number; end: number } {
  const before = root.ownerDocument.createRange()
  before.selectNodeContents(root)
  before.setEnd(range.startContainer, range.startOffset)
  const start = serializeComposer(before.cloneContents()).length
  before.setEnd(range.endContainer, range.endOffset)
  return { start, end: serializeComposer(before.cloneContents()).length }
}

/** Token offsets snap to the whole node; callers can never split an atomic emoji. */
export function rangeFromSerializedOffsets(root: HTMLElement, start: number, end = start): Range {
  function point(offset: number, endPoint: boolean): { node: Node; offset: number } {
    let remaining = Math.max(0, offset)
    function walk(parent: Node): { node: Node; offset: number } | null {
      for (let index = 0; index < parent.childNodes.length; index++) {
        const node = parent.childNodes[index]!
        const length = serializeComposer(node).length
        if (node.nodeType === 3 && remaining <= length) return { node, offset: remaining }
        if (node instanceof Element && (node.hasAttribute('data-emoji-id') || node.tagName === 'BR')) {
          if (remaining < length || remaining === 0) return { node: parent, offset: index + (remaining > 0 && endPoint ? 1 : 0) }
          remaining -= length
        } else if (node.nodeType === 3) remaining -= length
        else { const found = walk(node); if (found) return found }
      }
      return null
    }
    return walk(root) || { node: root, offset: root.childNodes.length }
  }
  const range = root.ownerDocument.createRange()
  const from = point(start, false)
  const to = point(end, end !== start)
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  return range
}

/** Used for both keyboard copy and message context menus; images copy as readable text. */
export function readableSelection(root: HTMLElement): string | null {
  const selection = root.ownerDocument.getSelection()
  if (!selection?.rangeCount || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null
  return emojiToPlainText(serializeComposer(range.cloneContents()))
}
