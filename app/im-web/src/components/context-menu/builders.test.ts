import { describe, expect, it, vi } from 'vitest'
import { normalizeMessage } from '../../api/message'
import { normalizeConversation } from '../../api/conversation'
import { buildConversationContextMenu, buildFileContextMenu, buildFriendContextMenu, buildInputContextMenu, buildMemberContextMenu, buildMessageContextMenu, safeHttpUrl, type MessageMenuContext } from './builders'
import type { ContextMenuItem } from './types'
import { splitTextLinks } from '../../utils/textLinks'

const run = vi.fn()
const actions = { reply: run, copy: run, forward: run, favorite: run, select: run, recall: run, delete: run, view: run, copyImage: run, save: run, openLink: run, copyLink: run, retry: run }
const context = (patch: Partial<MessageMenuContext> = {}): MessageMenuContext => ({ message: normalizeMessage({ messageId: '1', senderId: 'me', messageType: 'TEXT', content: 'hello', status: 'SENT' }), canRecall: false, actions, ...patch })
const ids = (items: ContextMenuItem[]) => items.filter(item => item.visible !== false).map(item => item.id)

describe('dynamic message menus', () => {
  it('offers text actions and hides recall completely for other/expired messages', () => {
    expect(ids(buildMessageContextMenu(context()))).toEqual(['reply', 'copy', 'forward', 'favorite', 'select', 'delete'])
    expect(ids(buildMessageContextMenu(context({ canRecall: true })))).toEqual(['reply', 'copy', 'forward', 'favorite', 'select', 'recall', 'delete'])
  })
  it.each(['me', 'other'])('offers real image commands for sender %s', senderId => {
    const menu = buildMessageContextMenu(context({ message: normalizeMessage({ messageId: '2', senderId, messageType: 'IMAGE' }), canRecall: senderId === 'me' }))
    expect(ids(menu)).toContain('copyImage')
    expect(ids(menu)).not.toContain('copy')
    expect(ids(menu).includes('recall')).toBe(senderId === 'me')
  })
  it('prioritizes the selected text and does not change the callback into whole-message copy', () => {
    const copy = vi.fn()
    const menu = buildMessageContextMenu(context({ selectedText: 'ell', actions: { ...actions, copy } }))
    expect(ids(menu).slice(0, 3)).toEqual(['copy', 'reply', 'forward'])
    menu[0]!.action!()
    expect(copy).toHaveBeenCalledOnce()
  })
  it('shows download before local availability and open/reveal after completion', () => {
    expect(ids(buildFileContextMenu(context({ actions: { ...actions, download: run, save: undefined } })))).toEqual(['download', 'forward', 'select', 'delete'])
    expect(ids(buildFileContextMenu(context({ actions: { ...actions, open: run, reveal: run } })))).toEqual(['open', 'reveal', 'save', 'forward', 'select', 'delete'])
  })
  it('offers link-specific copy and open while retaining reply/forward', () => {
    expect(ids(buildMessageContextMenu(context({ link: 'https://example.com' }))).slice(0, 4)).toEqual(['openLink', 'copyLink', 'reply', 'forward'])
  })
  it('limits failed, sending and recalled messages to meaningful commands', () => {
    for (const status of ['FAILED', 'SENDING', 'RECALLED']) {
      const result = ids(buildMessageContextMenu(context({ canRecall: false, message: normalizeMessage({ messageId: '1', status }) })))
      expect(result).not.toContain('forward')
      expect(result).not.toContain('recall')
      if (status === 'SENDING') expect(result).not.toContain('delete')
      if (status === 'FAILED') expect(result).toContain('retry')
      if (status === 'RECALLED') expect(result).toEqual(['delete'])
    }
  })
  it('does not offer resend for discontinued sticker messages', () => {
    const message = normalizeMessage({ messageId: '1', messageType: 'STICKER', status: 'FAILED', clientMsgId: 'legacy' })
    expect(ids(buildMessageContextMenu(context({ message })))).toEqual(['copy', 'delete'])
  })
  it('uses normal danger metadata and natural favorite labels', () => {
    const menu = buildMessageContextMenu(context({ canRecall: true, favorite: true }))
    expect(menu.find(item => item.id === 'favorite')?.label).toBe('取消收藏')
    expect(menu.find(item => item.id === 'recall')?.danger).toBe(true)
    expect(menu.find(item => item.id === 'delete')?.danger).toBe(true)
  })
})
describe('conversation and identity menus', () => {
  it.each([false, true])('uses natural pin/mute labels for state %s', enabled => {
    const menu = buildConversationContextMenu(normalizeConversation({ pinned: enabled, muted: enabled }), enabled ? 1 : 0, { read: run, pin: run, mute: run })
    expect(menu.find(item => item.id === 'pin')?.label).toBe(enabled ? '取消置顶' : '置顶')
    expect(menu.find(item => item.id === 'mute')?.label).toBe(enabled ? '取消消息免打扰' : '消息免打扰')
    expect(ids(menu)).not.toContain('delete')
    expect(ids(menu)).not.toContain('clear')
    expect(ids(menu)).not.toContain('window')
    expect(ids(menu)).not.toContain('unread')
  })
  it.each([
    ['member', 'member', false, false], ['admin', 'member', true, false], ['admin', 'admin', false, false],
    ['admin', 'owner', false, false], ['owner', 'admin', true, true], ['owner', 'member', true, true], ['owner', 'owner', false, false],
  ])('checks operator %s and target %s', (operator, role, remove, manage) => {
    const conversation = normalizeConversation({ type: 'GROUP', members: [{ userId: 'me', role: operator }] })
    const menu = buildMemberContextMenu(conversation, 'me', { userId: 'other', role }, { mention: run, profile: run, chat: run, remove: run, role: run })
    expect(ids(menu).includes('remove')).toBe(remove)
    expect(ids(menu).includes('role')).toBe(manage)
  })
  it.each(['member', 'admin', 'owner'])('avoids self-chat, self-removal and self-promotion for %s', role => {
    const self = { userId: 'me', role }
    expect(ids(buildMemberContextMenu(normalizeConversation({ type: 'GROUP', members: [self] }), 'me', self, { mention: run, chat: run, profile: run, role: run, remove: run }))).toEqual(['profile'])
  })
  it('does not invent friendship APIs for organization contacts', () => {
    expect(ids(buildFriendContextMenu(false, { chat: run, profile: run }))).toEqual(['chat', 'profile'])
    expect(ids(buildFriendContextMenu(true, { chat: run, profile: run }))).toEqual(['profile'])
  })
})
describe('input and URLs', () => {
  it('keeps disabled edit commands visible, including empty clipboard/selection', () => {
    const menu = buildInputContextMenu({ undo: false, redo: false, cut: false, copy: false, paste: false, selectAll: false }, run)
    expect(menu).toHaveLength(6)
    expect(menu.every(item => item.disabled && item.visible !== false)).toBe(true)
    expect(buildInputContextMenu({ undo: true, redo: false, cut: true, copy: true, paste: true, selectAll: true }, run).find(item => item.id === 'paste')?.disabled).toBe(false)
  })
  it.each(['javascript:alert(1)', 'file:///C:/secret', 'data:text/plain,a', 'https://', 'https://x\n.com', 'https://name:pass@example.com', 'about:blank'])('rejects unsafe URL %s', url => expect(safeHttpUrl(url)).toBeNull())
  it('allows http/https and preserves surrounding text when splitting links', () => {
    expect(safeHttpUrl('https://example.com')).toBe('https://example.com/')
    expect(safeHttpUrl('http://example.com/a?b=c')).toBe('http://example.com/a?b=c')
    expect(splitTextLinks('请查看 https://example.com，明天讨论')).toEqual(['请查看 ', 'https://example.com', '，明天讨论'])
  })
})
