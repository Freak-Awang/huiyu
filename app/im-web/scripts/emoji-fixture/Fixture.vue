<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { EmojiComposer, EmojiPicker, EmojiRenderer, type BuiltinEmoji, type EmojiComposerHandle } from '../../src/features/emoji'
import { getEmojiById, getEmojisByCategory, loadEmojiCatalog } from '../../src/features/emoji/composables/useEmojiCatalog'
import { useRecentEmoji, clearRecentEmoji } from '../../src/features/emoji/composables/useRecentEmoji'
import { hydrateFromSerializedMessage, readableSelection, serializeComposer } from '../../src/features/emoji/utils/emojiSerializer'
import { buildTextMessageContent, getMessagePreviewContent, normalizeMessage } from '../../src/api/message'
import { useConversationDrafts } from '../../src/stores/conversationDrafts'
const account = ref('emoji-regression')
const conversation = ref<string | undefined>('one')
const drafts = useConversationDrafts(account, conversation)
const editor = ref<EmojiComposerHandle | null>(null)
const open = ref(false)
const dark = ref(false)
const sent = ref<string[]>([])
const samples = ref<string[]>([])
const shortcut = ref<'enter' | 'ctrlEnter'>('enter')
const received = computed(() => sent.value.map(content => normalizeMessage({ content, messageType: 'TEXT' })))
const recent = useRecentEmoji()
const token = '[emoji:builtin_emoji_0001]'
const results: string[] = []
function check(condition: unknown, label: string): void { if (!condition) throw new Error(label); results.push(label) }
async function settle(): Promise<void> { await nextTick(); await new Promise(requestAnimationFrame); await nextTick() }
async function waitFor(predicate: () => boolean): Promise<void> {
  const start = performance.now()
  while (!predicate()) { if (performance.now() - start > 7000) throw new Error('Timed out awaiting fixture state'); await new Promise(resolve => setTimeout(resolve, 20)) }
  await settle()
}
function select(emoji: BuiltinEmoji): void { editor.value?.insertEmoji(emoji) }
function send(): void {
  const draft = drafts.snapshot(conversation.value!)
  if (!draft.text.trim()) return
  sent.value.push(buildTextMessageContent(draft.text, draft.mentions, draft.replyTo))
  drafts.clearIfUnchanged(conversation.value!, draft)
  open.value = false
}
function keydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') { event.preventDefault(); open.value = false; return }
  if (event.key === 'Enter' && (shortcut.value === 'ctrlEnter' ? event.ctrlKey : !event.shiftKey)) { event.preventDefault(); send() }
}
function key(key: string, init: KeyboardEventInit = {}): void {
  editor.value!.element!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
}
async function setText(text: string): Promise<void> { drafts.text.value = text; await settle(); editor.value!.focus(); editor.value!.setSelectionRange(text.length, text.length) }
async function showPicker(): Promise<void> { open.value = true; await waitFor(() => !!document.querySelector('.builtin-emoji-item')) }
function category(label: string): void { (document.querySelector(`[role=tab][aria-label="${label}"]`) as HTMLButtonElement).click() }
onMounted(() => {
  Object.assign(window, { emojiRegression: {
    async run() {
      await drafts.flush()
      check(!document.querySelector('img') && performance.getEntriesByType('resource').every(entry => !entry.name.includes('/emoji/builtin/')), 'closed editor loads no manifest or PNGs')
      clearRecentEmoji()
      await showPicker()
      check(document.querySelector('[role=tab][aria-selected=true]')?.getAttribute('aria-label') === '笑脸', 'empty recents open smile category')
      check((await loadEmojiCatalog()).byId.size === 736 && getEmojisByCategory('flag').length === 269, 'all retained manifest items available without guessing IDs')
      check(Array.from(document.querySelectorAll('[role=tab]')).map(tab => tab.getAttribute('aria-label')).join(',') === '最近,笑脸,活动,符号,旗帜', 'picker only exposes retained categories and recent')
      await setText('你好')
      editor.value!.setSelectionRange(1, 1)
      ;(document.querySelector('.builtin-emoji-item') as HTMLButtonElement).click()
      await settle()
      check(drafts.text.value === `你${token}好` && editor.value!.selectionStart === 1 + token.length, 'picker inserts an atomic image at 你|好 and restores caret')
      check(editor.value!.element!.querySelector('[data-emoji-id]')?.getAttribute('contenteditable') === 'false', 'composer token is contenteditable=false')
      check(!editor.value!.element!.textContent!.includes('builtin_emoji') && editor.value!.element!.querySelectorAll('img').length === 1, 'composer displays a real image instead of token text')
      editor.value!.insertEmoji(getEmojiById('builtin_emoji_0002')!)
      editor.value!.insertEmoji(getEmojiById('builtin_emoji_0003')!)
      await settle()
      check(editor.value!.element!.querySelectorAll('img').length === 3 && open.value, 'consecutive emoji insertion keeps picker open')
      key('Backspace'); await settle()
      check(editor.value!.element!.querySelectorAll('img').length === 2, 'Backspace removes exactly one whole token')
      editor.value!.setSelectionRange(1, 1); key('Delete'); await settle()
      check(editor.value!.element!.querySelectorAll('img').length === 1 && drafts.text.value.startsWith('你[emoji:builtin_emoji_0002]'), 'Delete removes the whole next token')
      editor.value!.undo(); await settle(); check(editor.value!.element!.querySelectorAll('img').length === 2, 'undo restores atomic image deletion')
      editor.value!.redo(); await settle(); check(editor.value!.element!.querySelectorAll('img').length === 1, 'redo restores atomic image deletion')
      editor.value!.select()
      const copied = new DataTransfer()
      editor.value!.element!.dispatchEvent(new ClipboardEvent('copy', { clipboardData: copied, bubbles: true, cancelable: true }))
      check(copied.getData('text/plain') === '你[表情]好', 'editor keyboard copy hides internal IDs')
      const pasted = new DataTransfer(); pasted.setData('text/html', '<img src=x onerror=alert(1)>'); pasted.setData('text/plain', '<b>普通文本</b>\n第二行')
      editor.value!.element!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: pasted, bubbles: true, cancelable: true }))
      await settle()
      check(drafts.text.value === '<b>普通文本</b>\n第二行' && !editor.value!.element!.querySelector('b,img'), 'paste reads plain text and never imports external HTML')
      await setText(`前\n${token}\n后\n`)
      check(serializeComposer(editor.value!.element!) === drafts.text.value, 'DOM serializer preserves text, atomic emoji and trailing newlines')
      const scratch = document.createElement('div')
      for (const text of ['', '\n', '\n\n', ` \n${token}\n\n末尾`, '[emoji:builtin_emoji_9999]', '[emoji:builtin_emoji_0812]', '<script>alert(1)</scr' + 'ipt>']) {
        hydrateFromSerializedMessage(scratch, text)
        check(serializeComposer(scratch) === text, `hydrate/serialize round trip: ${JSON.stringify(text)}`)
      }
      await setText(`你好${token}`)
      const captured = drafts.snapshot('one')
      conversation.value = 'two'; open.value = false; await settle()
      check(drafts.text.value === '' && !editor.value!.element!.querySelector('img') && !open.value, 'conversation switch isolates draft, selection and picker')
      editor.value!.insertText('第二会话'); await settle(); conversation.value = 'one'; await settle()
      check(drafts.text.value === captured.text && editor.value!.element!.querySelectorAll('img').length === 1, 'returning restores the serialized emoji draft as image')
      const beforeIME = sent.value.length
      editor.value!.element!.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      key('Enter', { isComposing: true }); key('Enter', { keyCode: 229 })
      check(sent.value.length === beforeIME, 'IME Enter and keyCode 229 never send')
      editor.value!.element!.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
      await settle()
      editor.value!.setSelectionRange(drafts.text.value.length, drafts.text.value.length)
      key('Enter', { shiftKey: true }); await settle()
      check(drafts.text.value === `${captured.text}\n`, 'Shift+Enter inserts a single newline')
      editor.value!.insertText('下一行'); key('Enter'); await settle()
      check(received.value.at(-1)?.displayContent === `${captured.text}\n下一行` && drafts.text.value === '' && !editor.value!.element!.hasChildNodes(), 'send retains TEXT JSON tokens and clears editor DOM')
      check(JSON.parse(sent.value.at(-1)!).text.includes(token) && !sent.value.at(-1)!.includes('images/'), 'server payload contains only stable token, never PNG paths')
      check(getMessagePreviewContent(received.value.at(-1)).includes('[表情]'), 'reply/list previews hide tokens')
      check(JSON.parse(buildTextMessageContent(received.value.at(-1)!.displayContent)).text.includes(token), 'forwarding retains original tokens')
      shortcut.value = 'ctrlEnter'; await setText('设置快捷键'); key('Enter'); await settle()
      check(drafts.text.value === '设置快捷键\n', 'Ctrl+Enter setting leaves Enter as newline')
      key('Enter', { ctrlKey: true }); await settle(); check(drafts.text.value === '', 'Ctrl+Enter setting sends correctly')
      samples.value = [token, token.repeat(3), token.repeat(4), `你好 ${token}`, '[emoji:builtin_emoji_9999]', '<img src=x onerror=alert(1)>', '历史[emoji:builtin_emoji_0812]']
      await settle()
      const renders = document.querySelectorAll<HTMLElement>('.sample .emoji-renderer')
      check(['48px', '40px', '32px', '1.35em'].every((size, index) => renders[index]!.style.getPropertyValue('--emoji-size') === size), 'pure Emoji sizes are 48/40/32 and mixed text uses 1.35em')
      check(renders[4]!.textContent === '[表情]' && !renders[4]!.querySelector('img'), 'unknown tokens fall back without broken images')
      check(renders[5]!.textContent === samples.value[5] && !renders[5]!.querySelector('img'), 'renderer escapes malicious message text')
      check(renders[6]!.textContent === '历史[表情]' && !renders[6]!.querySelector('img'), 'deleted category tokens render history fallback without requesting removed images')
      const mixed = renders[3]!
      const selected = document.createRange(); selected.selectNodeContents(mixed); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(selected)
      check(readableSelection(mixed) === '你好 [表情]', 'message selection copies Emoji as readable text')
      const broken = renders[0]!.querySelector('img')!; broken.dispatchEvent(new Event('error')); await settle()
      check(renders[0]!.textContent === '[表情]' && !renders[0]!.querySelector('img'), 'image errors show fallback instead of broken image')
      await showPicker(); category('旗帜'); await settle()
      const viewport = document.querySelector<HTMLElement>('.builtin-emoji-viewport')!
      const counts: number[] = []
      const frameGaps: number[] = []
      for (let i = 0; i < 25; i++) {
        const started = performance.now()
        viewport.scrollTop = i * viewport.scrollHeight / 24
        viewport.dispatchEvent(new Event('scroll'))
        await settle()
        frameGaps.push(performance.now() - started)
        counts.push(document.querySelectorAll('.builtin-emoji-item').length)
      }
      check(Math.max(...counts) <= 128 && Math.min(...counts) > 0, `flag virtual grid DOM min=${Math.min(...counts)}, max=${Math.max(...counts)}, p95 frame=${Math.round(frameGaps.sort((a,b)=>a-b)[23]!)}ms`)
      check(document.querySelector('.builtin-emoji-grid img:last-of-type') !== null, 'fast scrolling leaves visible content')
      category('笑脸'); await settle(); check(document.querySelector('.builtin-emoji-viewport')!.scrollTop === 0, 'category change resets scroll offset')
      const closedCounts: number[] = []
      for (let i = 0; i < 4; i++) { open.value = false; await settle(); closedCounts.push(window.emojiLifetimes().resize); await showPicker() }
      check(closedCounts.every(count => count === 0) && window.emojiLifetimes().resize === 1, 'picker closes disconnect ResizeObserver without growth on reopen')
      check(window.emojiLifetimes().selection === 1, 'conversation remounts keep exactly one composer selectionchange listener')
      clearRecentEmoji(); recent.rememberEmoji('builtin_emoji_0001'); recent.rememberEmoji('builtin_emoji_0002'); recent.rememberEmoji('builtin_emoji_0001')
      check(recent.ids.value.join(',') === 'builtin_emoji_0001,builtin_emoji_0002', 'recent selection moves duplicates to front')
      category('最近'); await settle(); check(document.querySelectorAll('.builtin-emoji-item').length === 2, 'recent category shows only remembered items')
      await drafts.flush()
      return results
    },
    async failure() {
      samples.value = [`你好 ${token}`]
      open.value = true
      await waitFor(() => document.querySelector('.builtin-emoji-status')?.textContent === '表情资源加载失败')
      check(document.querySelector('.sample')?.textContent?.includes('你好 [表情]'), 'catalog failure renders history fallback')
      await setText('资源失败仍可输入'); key('Enter'); await settle()
      check(received.value.at(-1)?.displayContent === '资源失败仍可输入', 'catalog failure does not block ordinary text sending')
      conversation.value = 'failure-other'; await settle(); check(!drafts.text.value, 'catalog failure does not block conversation switches')
      return results
    },
    async screenshot(isDark: boolean) {
      dark.value = isDark; document.documentElement.classList.toggle('dark-theme', isDark)
      samples.value = []; await settle()
      samples.value = [token, token.repeat(3), token.repeat(4), `你好 ${token} 今天怎么样`]
      await setText(`你好 ${token} 今天怎么样`)
      await showPicker(); category('旗帜'); await settle()
      const images = Array.from(document.querySelectorAll('img'))
      await Promise.all(images.map(image => image.decode().catch(() => undefined)))
      await settle()
    },
    editor: () => editor.value,
    async prepareNative() { shortcut.value = 'enter'; await setText('你好'); editor.value!.setSelectionRange(1, 1); editor.value!.insertEmoji(getEmojiById('builtin_emoji_0001')!); await settle() },
    state: () => ({ text: drafts.text.value, sent: [...sent.value], images: editor.value?.element?.querySelectorAll('img').length }),
  } })
})
</script>
<template>
  <main :class="{ 'dark-theme': dark }">
    <h1>灵绘 IM · 内置 Emoji V1</h1>
    <p class="hint">本地资源 · 分类与最近使用 · 原子表情编辑</p>
    <div class="layout">
      <section class="conversation">
        <article v-for="(sample, index) in samples" :key="index" class="sample"><EmojiRenderer :text="sample" /></article>
        <article v-for="(message, index) in received" :key="`received-${index}`" class="received"><EmojiRenderer :text="message.displayContent" /></article>
        <EmojiComposer ref="editor" :key="conversation" v-model="drafts.text.value" placeholder="输入消息" @keydown="keydown" />
        <button type="button" @mousedown.prevent="editor?.saveRange()" @click="open = !open">表情</button>
        <button type="button" @click="send">发送</button>
      </section>
      <aside v-if="open"><EmojiPicker @select="select" /></aside>
    </div>
  </main>
</template>
<style scoped>
main { padding: 28px; background: var(--bg-app); color: var(--text-primary); height: 100vh; overflow: auto; }
h1 { font-size: 22px; } .hint { color: var(--text-secondary); margin: 8px 0 24px; }
.layout { display: flex; align-items: flex-end; gap: 22px; }
.conversation { width: 360px; } .sample, .received { background: var(--bg-bubble-outbound); padding: 10px 14px; margin-bottom: 10px; border-radius: var(--radius-lg); }
.emoji-composer { padding: 12px; margin-top: 20px; height: 110px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-md); overflow-y: auto; }
aside { padding: 10px; width: 400px; border: 1px solid var(--border-light); background: var(--bg-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); }
button { margin: 10px 8px 0 0; padding: 6px 16px; background: var(--accent); color: var(--accent-text-on); border: 0; border-radius: var(--radius-sm); }
</style>
