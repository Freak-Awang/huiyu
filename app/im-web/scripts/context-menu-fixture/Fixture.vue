<template>
  <main :class="{ 'dark-theme': dark }">
    <h1>辉语 · 右键菜单交互回归</h1>
    <p>使用真实 ContextMenu、Builder 和菜单业务适配，全部操作指向测试数据。</p>
    <section id="messages" @contextmenu="bubbled++">
      <article v-for="message in messages" :key="message.messageId" :id="`message-${message.messageId}`" @contextmenu="menu.openMessageMenu($event, message)">{{ message.displayContent }}</article>
    </section>
    <textarea ref="input" id="editor" @contextmenu="menu.openInputMenu" aria-label="输入消息">测试输入文本</textarea>
    <ContextMenu :dark="dark" @error="errors.push($event)" />
    <div id="outside">聊天背景保留默认右键行为</div>
  </main>
</template>
<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import ContextMenu from '../../src/components/context-menu/ContextMenu.vue'
import { useChatContextMenus } from '../../src/components/context-menu/useChatContextMenus'
import { closeContextMenu, openContextMenu, useContextMenu } from '../../src/components/context-menu/useContextMenu'
import { normalizeMessage } from '../../src/api/message'
import { normalizeConversation } from '../../src/api/conversation'
import { useAuthStore } from '../../src/stores/auth'
import { useChatStore } from '../../src/stores/chat'
import http from '../../src/api'
const requests: string[] = []
let policyUnavailable = false
http.defaults.adapter = async config => {
  requests.push(config.url || '')
  if (config.url !== '/api/messages/policy') throw new Error('Fixture blocked a network request')
  if (policyUnavailable) throw new Error('404: old server has no policy endpoint')
  return { data: { recallWindowMs: 120000, serverTime: Date.now() }, status: 200, statusText: 'OK', headers: {}, config }
}
const copies: string[] = [], errors: string[] = [], commands: string[] = []
let deleted: Record<string, string[]> = {}, favorites: unknown[] = []
window.imDesktop = {
  copyText: async text => { copies.push(text); return true },
  clipboardState: async () => ({ text: false, image: false }),
  editCommand: async command => { commands.push(command); return true },
  messageLibrary: async () => ({ deleted, favorites }),
  updateMessageLibrary: async (_user, action, messages) => {
    if (action === 'delete') deleted = { ...deleted, '10': messages.map(message => `id:${message.messageId}`) }
    else favorites = action === 'favorite' ? messages : []
    return { deleted, favorites }
  },
} as typeof window.imDesktop
const auth = useAuthStore()
auth.user = { userId: '1', username: 'test', nickname: '测试用户', avatar: '', signature: '', role: 'user' }
auth.authState = 'authenticated'
const chat = useChatStore()
const conversation = normalizeConversation({ conversationId: '10', name: '回归测试', type: 'GROUP', members: [{ userId: '1', role: 'owner' }, { userId: '2', role: 'member' }] })
chat.conversations = [conversation]
chat.currentConversation = conversation
const messages = [
  normalizeMessage({ messageId: '100', conversationId: '10', senderId: '1', senderName: '测试用户', content: '自己的文字消息：今晚服务器更新完成。', createdAt: new Date().toISOString(), status: 'SENT' }),
  normalizeMessage({ messageId: '101', conversationId: '10', senderId: '2', senderName: '张三', content: '别人的文字消息：可以选择其中一部分复制。', createdAt: new Date().toISOString(), status: 'SENT' }),
  normalizeMessage({ messageId: '102', conversationId: '10', senderId: '1', messageType: 'IMAGE', content: '{}', createdAt: new Date().toISOString(), status: 'SENT' }),
]
chat.messages.set('10', messages)
const input = ref<HTMLTextAreaElement | null>(null)
const dark = ref(false), bubbled = ref(0)
const menu = useChatContextMenus({ input, reply: () => commands.push('reply'), recall: async () => { commands.push('recall') }, retry: () => commands.push('retry'),
  viewImage: () => commands.push('view'), download: async () => {}, profile: () => {}, chat: async () => {}, mention: () => {}, role: async () => {}, remove: async () => {}, transfer: async () => {}, forward: async () => {}, feedback: (text, error) => { if (error) errors.push(text) } })
const pause = () => new Promise(resolve => setTimeout(resolve, 120))
const labels = () => Array.from(document.querySelectorAll('[role=menuitem]')).map(item => item.querySelector('.context-menu-label')?.textContent?.trim())
function rightClick(id: string, x = 340, y = 190) {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y })
  document.getElementById(id)!.dispatchEvent(event)
  return event
}
function key(value: string) { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })) }
function choose(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')).find(item => item.querySelector('.context-menu-label')?.textContent?.trim() === label)
  if (!button) throw new Error(`Missing menu command: ${label}`)
  button.click()
}
const results: string[] = []
function check(condition: unknown, name: string) { if (!condition) throw new Error(name); results.push(name) }
onMounted(async () => {
  await menu.library.init('1')
  await menu.policy.refresh()
  window.menuRegression = {
    async screenshot(isDark = false) {
      dark.value = isDark; rightClick('message-100', 460, 240); await pause()
      // Hidden windows may suspend compositor animations until capture; finish only for deterministic artifacts.
      document.getAnimations().forEach(animation => animation.finish())
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    },
    async run() {
      rightClick('message-100'); await pause()
      check(labels().includes('撤回') && labels().includes('转发'), 'own text menu and server recall policy')
      check(bubbled.value === 0, 'message contextmenu does not bubble to chat background')
      for (const [x, y] of [[0, 0], [innerWidth - 1, 0], [0, innerHeight - 1], [innerWidth - 1, innerHeight - 1]]) {
        rightClick('message-100', x, y); await pause()
        const rect = document.querySelector('[role=menu]')!.getBoundingClientRect()
        check(rect.left >= 5 && rect.top >= 5 && rect.right <= innerWidth - 5 && rect.bottom <= innerHeight - 5, `viewport bounds ${x},${y}`)
      }
      for (let i = 0; i < 10; i++) { rightClick(i % 2 ? 'message-100' : 'message-101'); await nextTick() }
      check(document.querySelectorAll('[role=menu]').length === 1, 'rapid right-click leaves exactly one menu')
      rightClick('message-101'); await pause(); check(!labels().includes('撤回'), 'other user cannot recall')
      const text = document.getElementById('message-101')!.firstChild!
      const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 5)
      getSelection()!.removeAllRanges(); getSelection()!.addRange(range)
      rightClick('message-101'); await pause()
      check(labels()[0] === '复制', 'selected text copy comes first')
      choose('复制'); await pause(); check(copies.at(-1) === text.textContent!.slice(0, 5), 'copies exactly selected text')
      check(!useContextMenu().session.value, 'command closes menu')
      getSelection()!.removeAllRanges()
      rightClick('message-100'); await pause(); key('ArrowDown'); key('Enter'); await pause()
      check(copies.at(-1) === messages[0]!.displayContent, 'keyboard down and enter execute copy')
      for (const event of ['Escape', 'Tab']) {
        rightClick('message-100'); await pause(); key(event); await pause(); check(!useContextMenu().session.value, `${event} dismisses menu`)
      }
      for (const event of ['resize', 'blur']) {
        rightClick('message-100'); await pause(); window.dispatchEvent(new Event(event)); await pause(); check(!useContextMenu().session.value, `${event} dismisses menu`)
      }
      rightClick('message-100'); await pause(); document.getElementById('messages')!.dispatchEvent(new Event('scroll')); await pause()
      check(!useContextMenu().session.value, 'chat scroll dismisses menu')
      rightClick('message-100'); await pause(); document.getElementById('outside')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await pause()
      check(!useContextMenu().session.value, 'outside pointer closes menu')
      check(!rightClick('outside').defaultPrevented, 'background keeps browser default context menu')
      rightClick('message-100'); await pause(); chat.currentConversation = normalizeConversation({ conversationId: '11' }); await pause()
      check(!useContextMenu().session.value, 'conversation switch dismisses menu')
      chat.currentConversation = conversation
      const editor = input.value!; editor.value = ''; editor.focus(); editor.setSelectionRange(0, 0)
      rightClick('editor'); await pause()
      check(document.querySelectorAll('[role=menuitem][aria-disabled=true]').length === 6, 'empty input commands remain visible and disabled')
      closeContextMenu(); editor.value = 'abcdef'; editor.focus(); editor.setSelectionRange(1, 4)
      rightClick('editor'); await pause(); choose('复制'); await pause()
      check(commands.includes('copy') && editor.selectionStart === 1 && editor.selectionEnd === 4 && document.activeElement === editor, 'input action restores focus and selection')
      openContextMenu(new MouseEvent('contextmenu', { clientX: innerWidth - 10, clientY: innerHeight - 10 }), [{ id: 'sub', label: '转发到', children: [{ id: 'leaf', label: '最近联系人', action: () => { commands.push('submenu') } }] }]); await pause()
      key('ArrowRight'); await pause(); check(document.querySelectorAll('[role=menu]').length === 2, 'right arrow opens submenu')
      key('ArrowLeft'); await pause(); check(document.querySelectorAll('[role=menu]').length === 1, 'left arrow returns to parent')
      key('ArrowRight'); await pause(); key('Enter'); await pause(); check(commands.includes('submenu'), 'submenu enter executes command')
      check(requests.length === 1, 'opening menus makes no server requests')
      // Reproduce deployment with the pre-existing recall endpoint but no new policy endpoint.
      policyUnavailable = true
      menu.policy.reset(); await menu.policy.refresh()
      rightClick('message-100'); await pause()
      check(labels().includes('撤回'), 'legacy server still shows recall for a recent own message')
      choose('撤回'); await pause()
      check(commands.includes('recall'), 'legacy recall dispatches the existing action')
      rightClick('message-101'); await pause()
      check(!labels().includes('撤回'), 'legacy server still hides recall for other senders')
      const original = chat.messages.get('10')![0]!
      chat.messages.get('10')![0] = { ...original, createdAt: new Date(Date.now() - 121000).toISOString() }
      rightClick('message-100'); await pause()
      check(!labels().includes('撤回'), 'legacy server hides recall after two minutes')
      chat.messages.get('10')![0] = original
      check(requests.length === 2, 'legacy menu opens do not retry the optional API')
      check(!errors.length, 'no menu execution errors')
      return results
    },
  }
})
</script>
<style scoped>
main { min-height: 100vh; padding: 32px; background: var(--bg-chat); color: var(--text-primary); }
h1 { font-size: 21px; margin-bottom: 10px; } p { font-size: 13px; color: var(--text-secondary); margin-bottom: 20px; }
article { max-width: 380px; margin: 14px 0; padding: 16px; border-radius: 12px; background: var(--bg-surface); font-size: 14px; }
textarea { display: block; width: 400px; max-width: 100%; margin: 24px 0; height: 84px; border: 1px solid var(--border); background: var(--bg-input-rest); color: var(--text-primary); padding: 12px; }
#outside { color: var(--text-tertiary); font-size: 12px; }
</style>
