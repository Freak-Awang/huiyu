// Mount the production Chat.vue. Only network/native boundaries use in-memory fixture data.
import { createApp, nextTick } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import Chat from '../../src/views/Chat.vue'
import { useAuthStore } from '../../src/stores/auth'
import { useChatStore } from '../../src/stores/chat'
import { useAttachmentDraftStore } from '../../src/stores/attachmentDrafts'
import { normalizeConversation } from '../../src/api/conversation'
import { buildTextMessageContent } from '../../src/api/message'
import { serializeComposer, rangeFromSerializedOffsets } from '../../src/features/emoji/utils/emojiSerializer'
import http from '../../src/api'
import '../../src/style.css'
import type { ConversationDraft } from '../../src/stores/conversationDrafts'
declare global { interface Window { emojiFixture: { manifest(): Promise<unknown> } } }
const token = '[emoji:builtin_emoji_0001]'
const drafts: Record<string, Record<string, ConversationDraft>> = {}
const copies: string[] = []
window.imDesktop = {
  getVersion: async () => 'fixture', getPlatform: async () => 'win32', openExternal: async () => true,
  upsertMessage: async () => true, listMessages: async () => [], searchMessages: async () => [],
  loadBuiltinEmojiManifest: window.emojiFixture.manifest,
  listDrafts: async user => drafts[user] || {},
  saveDraft: async (user, conversation, draft) => {
    const account = drafts[user] ||= {}
    if (draft) account[conversation] = structuredClone(draft)
    else delete account[conversation]
    return true
  },
  messageLibrary: async () => ({ deleted: {}, favorites: [] }),
  copyText: async text => { copies.push(text); return true },
  clipboardState: async () => ({ text: false, image: false }),
}
const members = [{ userId: '1', nickname: '测试用户', role: 'OWNER' }, { userId: '2', nickname: '小李', role: 'MEMBER' }]
const conversations = ['one', 'two'].map((id, index) => ({ conversationId: id, name: index ? '另一个会话' : 'Emoji 验收群', type: 2, ownerId: '1', memberCount: 2, members }))
const history = [{ messageId: '100', conversationId: 'one', senderId: '2', senderName: '小李', messageType: 'TEXT' as const,
  content: buildTextMessageContent(`你好 ${token} @测试用户 https://example.test`, [{ userId: '1', nickname: '测试用户' }], { messageId: '99', senderName: '甲', text: token }), createdAt: new Date().toISOString(), status: 'SENT' },
  { messageId: '101', conversationId: 'one', senderId: '2', senderName: '小李', messageType: 'STICKER' as const,
    content: JSON.stringify({ id: 'smile', name: '微笑', url: '/assets/smile.svg' }), createdAt: new Date().toISOString(), status: 'SENT' },
  { messageId: '102', conversationId: 'one', senderId: '1', senderName: '测试用户', messageType: 'STICKER' as const,
    content: JSON.stringify({ id: 'custom-1', name: '自定义', source: 'custom', localOnly: true }), clientMsgId: 'legacy-custom', createdAt: new Date().toISOString(), status: 'FAILED' }]
http.defaults.adapter = async config => {
  const url = config.url || ''
  let data: unknown = null
  if (url === '/api/conversations') data = conversations
  else if (url.startsWith('/api/conversations/')) data = conversations.find(item => url.endsWith(item.conversationId)) || conversations[0]
  else if (url === '/api/settings') data = { notification: { desktop: false, sound: false } }
  else if (url === '/api/depts/tree' || url === '/api/users/list' || url === '/api/messages/pending') data = []
  else if (url === '/api/auth/ws-ticket') data = { ticket: 'local-fixture' }
  else if (url === '/api/messages/policy') data = { recallWindowMs: 120000, serverTime: Date.now() }
  else if (/^\/api\/messages\/(one|two)$/.test(url)) data = { records: url.endsWith('one') ? history : [] }
  else if (url.startsWith('/api/users/')) data = members.find(member => url.endsWith(member.userId)) || members[0]
  else if (!/^\/api\/messages\/(ack|read)\//.test(url)) throw new Error(`Unexpected fixture API: ${url}`)
  return { data, status: 200, statusText: 'OK', headers: {}, config }
}
interface Packet { cmd: string; seq: number; data: Record<string, unknown> }
const packets: Packet[] = []
class FixtureSocket {
  static OPEN = 1
  static CLOSED = 3
  readyState = 1
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor() { setTimeout(() => this.onopen?.(), 0) }
  send(text: string): void {
    const packet = JSON.parse(text) as Packet
    packets.push(packet)
    setTimeout(() => this.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ cmd: `${packet.cmd}_ACK`, seq: packet.seq,
      data: packet.cmd === 'MESSAGE_SEND' ? { messageId: String(200 + packets.length), status: 'SENT' } : { ok: true, online: false, statuses: [] } }) })), 0)
  }
  close(): void { this.readyState = 3 }
}
Object.defineProperty(window, 'WebSocket', { value: FixtureSocket })
localStorage.setItem('imServerOrigin', 'https://fixture.invalid')
localStorage.setItem('token', 'local-test-token')
localStorage.setItem('imCurrentUserId', '1')
localStorage.removeItem('linghui.im.emoji.recent.v1')
const pinia = createPinia()
const app = createApp(Chat).use(pinia).use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] }))
const auth = useAuthStore(pinia)
auth.user = { userId: '1', username: 'test', nickname: '测试用户', role: 'USER', avatar: '', signature: '' }
auth.token = 'local-test-token'; auth.authState = 'authenticated'
const chat = useChatStore(pinia)
chat.conversations = conversations.map(normalizeConversation)
chat.currentConversation = chat.conversations[0]!
app.mount('#app')
const results: string[] = []
function check(condition: unknown, label: string): void { if (!condition) throw new Error(label); results.push(label) }
async function settle(): Promise<void> { await nextTick(); await new Promise(requestAnimationFrame); await nextTick() }
async function waitFor(predicate: () => boolean): Promise<void> {
  const start = performance.now()
  while (!predicate()) { if (performance.now() - start > 7000) throw new Error('Chat integration wait timed out'); await new Promise(resolve => setTimeout(resolve, 20)) }
  await settle()
}
function editor(): HTMLElement { return document.querySelector<HTMLElement>('.message-input')! }
function caret(start: number, end = start): void {
  editor().focus(); const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(rangeFromSerializedOffsets(editor(), start, end))
  document.dispatchEvent(new Event('selectionchange'))
}
function paste(text: string): void {
  const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', text)
  editor().dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
}
function click(selector: string): void { document.querySelector<HTMLButtonElement>(selector)!.click() }
function key(key: string, init: KeyboardEventInit = {}): void { editor().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })) }
Object.assign(window, { emojiChatRegression: {
  async run() {
    await waitFor(() => packets.some(packet => packet.cmd === 'ONLINE_STATUS'))
    await chat.selectConversation('one'); await settle()
    check(document.querySelectorAll('.message-content .inline-emoji').length === 1, 'production Chat renders received TEXT tokens')
    check(document.querySelector('.mention-self')?.textContent === '@测试用户' && !!document.querySelector('.text-bubble a[href="https://example.test/"]'), 'production Chat preserves mentions and clickable text links')
    check(document.querySelector('.reply-preview')?.textContent?.includes('[表情]') && !document.querySelector('.reply-preview')?.textContent?.includes('builtin_emoji'), 'production quoted previews never expose tokens')
    const legacyBubbles = Array.from(document.querySelectorAll('.message-content')).filter(item => item.textContent === '[表情已停用]')
    check(legacyBubbles.length === 2 && legacyBubbles.every(item => !item.querySelector('img')), 'legacy builtin and custom sticker history uses text placeholders without image requests')
    check(!document.querySelector('.message-retry'), 'failed legacy stickers cannot be resent from the message bubble')
    const stableMessage = document.querySelector('.message-item')
    caret(0); paste('你好'); await settle(); caret(1)
    click('button[title="表情"]'); await waitFor(() => !!document.querySelector('.builtin-emoji-item'))
    check(!!document.querySelector('.emoji-panel .builtin-emoji-picker') && !document.querySelector('.emoji-panel .emoji-tabs, .emoji-panel input[type=file]') && !document.querySelector('.emoji-panel')!.textContent!.includes('大表情'), 'production picker directly opens Emoji with no sticker tab or upload controls')
    click('.builtin-emoji-item'); await settle()
    check(serializeComposer(editor()) === `你${token}好` && !!document.querySelector('.emoji-panel'), 'production toolbar inserts at the saved caret and keeps picker open')
    check(document.querySelector('.message-item') === stableMessage, 'picker/recent updates preserve the existing message DOM')
    document.querySelector('[role=tab]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await settle()
    check(!document.querySelector('.emoji-panel'), 'Escape closes production picker from a category tab')
    click('button[title="表情"]'); await settle(); document.querySelector('.message-area')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await settle()
    check(!document.querySelector('.emoji-panel'), 'outside click closes production picker')
    click('button[title="表情"]'); await settle(); await chat.selectConversation('two'); await settle()
    check(!serializeComposer(editor()) && !document.querySelector('.emoji-panel'), 'production conversation switch clears picker and old selection')
    await chat.selectConversation('one'); await settle()
    check(serializeComposer(editor()) === `你${token}好` && editor().querySelectorAll('img').length === 1, 'production draft restores atomic Emoji when returning')
    caret(serializeComposer(editor()).length); paste(' @'); await settle()
    check(!!document.querySelector('.mention-picker'), 'typing @ after Emoji still opens member picker')
    const mention = Array.from(document.querySelectorAll<HTMLElement>('.mention-option')).find(item => item.textContent?.includes('小李'))!
    mention.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); await settle()
    check(serializeComposer(editor()).endsWith('@小李 '), 'mention selection replaces @ text after Emoji')
    key('Enter'); await waitFor(() => packets.some(packet => packet.cmd === 'MESSAGE_SEND'))
    const send = packets.filter(packet => packet.cmd === 'MESSAGE_SEND').at(-1)!
    const content = JSON.parse(String(send.data.content)) as { text: string; mentions: { userId: string }[] }
    check(send.data.messageType === 'TEXT' && content.text === `你${token}好 @小李` && content.mentions[0]?.userId === '2', 'production sender emits unchanged TEXT JSON with tokens and structured mentions')
    check(!serializeComposer(editor()) && editor().querySelectorAll('img').length === 0, 'production send clears serialized draft and atomic DOM')
    check(document.querySelectorAll('.message-content .inline-emoji').length === 2, 'sent bubble renders the original Emoji token')
    const bubble = document.querySelector<HTMLElement>('.message-content')!
    window.getSelection()?.removeAllRanges()
    bubble.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 600, clientY: 200 })); await settle()
    const items = Array.from(document.querySelectorAll<HTMLElement>('[role=menuitem]'))
    check(!items.some(item => /保存图片|打开图片|另存为/.test(item.textContent || '')), 'Emoji uses text context menu without image actions')
    items.find(item => item.textContent?.trim() === '复制')!.click(); await settle()
    check(copies.at(-1)?.includes('[表情]') && !copies.at(-1)?.includes('builtin_emoji'), 'production message copy hides internal IDs')
    // Keep existing attachment paste and atomic attachment navigation.
    const transfer = new DataTransfer(); transfer.items.add(new File(['fixture'], 'paste.png', { type: 'image/png' }))
    caret(0); editor().dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true })); await settle()
    check(useAttachmentDraftStore(pinia).draftsFor('one').length === 1, 'production image paste still enters the attachment tray')
    key('Backspace'); await settle(); check(useAttachmentDraftStore(pinia).draftsFor('one').length === 0, 'Backspace at start still removes the attachment atomic item')
    caret(0); paste(token); await settle(); click('button[title="表情"]'); await waitFor(() => !!document.querySelector('.builtin-emoji-item'))
    return results
  },
  async screenshot() { await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>('.inline-emoji, .composer-emoji-token img')).map(image => image.decode().catch(() => undefined))); await settle() },
  dispose: () => app.unmount(),
} })
