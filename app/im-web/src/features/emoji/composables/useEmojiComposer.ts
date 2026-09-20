import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import type { BuiltinEmoji, EmojiComposerHandle } from '../types'
import { emojiToken, emojiToPlainText } from '../utils/emojiMessage'
import { parseEmojiMessage } from '../utils/emojiParser'
import { createEmojiFragment, ensureComposerCaretLine, hydrateFromSerializedMessage, rangeFromSerializedOffsets, serializeComposer, serializedRangeOffsets } from '../utils/emojiSerializer'
import { loadEmojiCatalog, useEmojiCatalog } from './useEmojiCatalog'

interface Snapshot { text: string; start: number; end: number }
export function useEmojiComposer(root: Ref<HTMLDivElement | null>, props: { modelValue: string; disabled?: boolean }, update: (value: string) => void) {
  const composing = ref(false)
  const text = ref(props.modelValue)
  const history = ref<Snapshot[]>([])
  const historyIndex = ref(-1)
  let lastComposerRange: Range | null = null
  let disposed = false
  const { catalog } = useEmojiCatalog()

  function validRange(range: Range | null): range is Range {
    return !!range && !!root.value?.contains(range.startContainer) && !!root.value?.contains(range.endContainer)
  }
  function saveRange(): void {
    const selection = root.value?.ownerDocument.getSelection()
    if (selection?.rangeCount && validRange(selection.getRangeAt(0))) lastComposerRange = selection.getRangeAt(0).cloneRange()
  }
  function offsets(): { start: number; end: number } {
    saveRange()
    return root.value && validRange(lastComposerRange) ? serializedRangeOffsets(root.value, lastComposerRange) : { start: text.value.length, end: text.value.length }
  }
  function selectRange(range: Range): void {
    const selection = root.value?.ownerDocument.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    lastComposerRange = range.cloneRange()
  }
  function setSelectionRange(start: number, end: number): void {
    if (root.value) selectRange(rangeFromSerializedOffsets(root.value, start, end))
  }
  function loadIfNeeded(value: string): void {
    if (parseEmojiMessage(value).some(segment => segment.type === 'emoji')) void loadEmojiCatalog().catch(() => undefined)
  }
  function snapshot(): Snapshot { return { text: text.value, ...offsets() } }
  function resetHistory(): void { history.value = [snapshot()]; historyIndex.value = 0 }
  function beforeEdit(): void {
    if (history.value[historyIndex.value]) history.value[historyIndex.value] = snapshot()
  }
  function commit(): void {
    if (!root.value || composing.value) return
    text.value = serializeComposer(root.value)
    saveRange()
    if (history.value[historyIndex.value]?.text !== text.value) {
      history.value = [...history.value.slice(0, historyIndex.value + 1), snapshot()].slice(-100)
      historyIndex.value = history.value.length - 1
    }
    update(text.value)
    loadIfNeeded(text.value)
  }
  function restoreSnapshot(value: Snapshot): void {
    if (!root.value) return
    text.value = value.text
    hydrateFromSerializedMessage(root.value, value.text)
    root.value.focus({ preventScroll: true })
    setSelectionRange(value.start, value.end)
    update(value.text)
  }
  function undo(): void { if (!props.disabled && !composing.value && historyIndex.value > 0) restoreSnapshot(history.value[--historyIndex.value]!) }
  function redo(): void { if (!props.disabled && !composing.value && historyIndex.value < history.value.length - 1) restoreSnapshot(history.value[++historyIndex.value]!) }
  function insertText(value: string): void {
    if (!root.value || props.disabled || composing.value) return
    const position = offsets()
    beforeEdit()
    root.value.focus({ preventScroll: true })
    const range = rangeFromSerializedOffsets(root.value, position.start, position.end)
    range.deleteContents()
    const normalized = value.replace(/\r\n?/g, '\n')
    range.insertNode(createEmojiFragment(normalized, root.value.ownerDocument))
    root.value.normalize()
    ensureComposerCaretLine(root.value)
    setSelectionRange(position.start + normalized.length, position.start + normalized.length)
    commit()
  }
  function insertEmoji(emoji: BuiltinEmoji): void { insertText(emojiToken(emoji.id)) }
  function keydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || composing.value || event.isComposing || event.keyCode === 229 || props.disabled) return
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      const key = event.key.toLowerCase()
      if (key === 'z' || key === 'y') { event.preventDefault(); if (key === 'y' || event.shiftKey) redo(); else undo(); return }
    }
    if (event.key === 'Enter') { event.preventDefault(); insertText('\n'); return }
    if (event.key !== 'Backspace' && event.key !== 'Delete') return
    const { start, end } = offsets()
    if (start !== end) { event.preventDefault(); insertText(''); return }
    const before = text.value.slice(0, start).match(/\[emoji:builtin_emoji_\d{4}\]$/)?.[0]
    const after = text.value.slice(end).match(/^\[emoji:builtin_emoji_\d{4}\]/)?.[0]
    const token = event.key === 'Backspace' ? before : after
    if (!token) return
    event.preventDefault()
    setSelectionRange(event.key === 'Backspace' ? start - token.length : start, event.key === 'Delete' ? end + token.length : end)
    insertText('')
  }
  function beforeInput(event: InputEvent): void {
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
      event.preventDefault()
      if (event.inputType === 'historyUndo') undo(); else redo()
    } else if (!composing.value) beforeEdit()
  }
  function compositionStart(): void { beforeEdit(); composing.value = true }
  function compositionEnd(): void {
    composing.value = false
    commit()
    // Catalog may have finished while the IME owned the DOM.
    refreshImages()
  }
  function copy(event: ClipboardEvent, cut = false): void {
    const { start, end } = offsets()
    if (start === end || !event.clipboardData) return
    event.preventDefault()
    event.clipboardData.setData('text/plain', emojiToPlainText(text.value.slice(start, end)))
    if (cut) insertText('')
  }
  function syncModel(value: string): void {
    if (!root.value || composing.value || value === serializeComposer(root.value)) return
    text.value = value
    lastComposerRange = null
    hydrateFromSerializedMessage(root.value, value)
    resetHistory()
    loadIfNeeded(value)
  }
  function refreshImages(): void {
    if (!root.value || composing.value || disposed || !text.value.includes('[emoji:')) return
    const selection = offsets()
    const focused = document.activeElement === root.value
    hydrateFromSerializedMessage(root.value, text.value)
    lastComposerRange = rangeFromSerializedOffsets(root.value, selection.start, selection.end)
    if (focused) selectRange(lastComposerRange)
  }
  watch(() => props.modelValue, syncModel, { flush: 'post' })
  watch(catalog, refreshImages)
  onMounted(() => {
    if (root.value) hydrateFromSerializedMessage(root.value, props.modelValue)
    resetHistory()
    loadIfNeeded(props.modelValue)
    document.addEventListener('selectionchange', saveRange)
  })
  onUnmounted(() => { disposed = true; lastComposerRange = null; document.removeEventListener('selectionchange', saveRange); history.value = [] })
  const handle: EmojiComposerHandle = {
    get element() { return root.value }, get value() { return text.value }, get disabled() { return !!props.disabled },
    get selectionStart() { return offsets().start }, get selectionEnd() { return offsets().end },
    get canUndo() { return historyIndex.value > 0 }, get canRedo() { return historyIndex.value < history.value.length - 1 },
    focus: options => root.value?.focus(options), setSelectionRange, select: () => setSelectionRange(0, text.value.length),
    insertText, insertEmoji, undo, redo, saveRange,
  }
  return { handle, text, composing, commit, keydown, beforeInput, compositionStart, compositionEnd, copy, saveRange }
}
