/**
 * 消息 API 单元测试：验证消息数据规范化逻辑（如头像路径转换）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./index', () => ({ default: {} }))

import { buildTextMessageContent, getMessagePreviewContent, normalizeMessage } from './message'

describe('message API normalization', () => {
  it.each([
    JSON.stringify({ id: 'smile', name: '微笑', url: '/assets/smile.svg' }),
    JSON.stringify({ id: 'custom-1', name: '自定义', source: 'custom', localOnly: true }),
    'invalid legacy payload',
  ])('keeps legacy sticker history readable after feature removal: %s', content => {
    const message = normalizeMessage({ messageType: 'STICKER', content })
    expect(message.content).toBe(content)
    expect(message.displayContent).toBe('[表情已停用]')
    expect(getMessagePreviewContent(message)).toBe('[表情已停用]')
    expect(getMessagePreviewContent({ messageType: 'STICKER', content, displayContent: '旧缓存表情名称' })).toBe('[表情已停用]')
  })
  it('keeps Emoji tokens in TEXT payloads and forwarding while hiding them from previews', () => {
    const text = '你好 [emoji:builtin_emoji_0001] [emoji:builtin_emoji_9999]'
    const content = buildTextMessageContent(text, [], { messageId: '1', senderName: '甲', text: '引用 [emoji:builtin_emoji_0001]' })
    const message = normalizeMessage({ messageType: 'TEXT', content })
    expect(message.content).toBe(content)
    expect(message.displayContent).toBe(text)
    expect(JSON.parse(buildTextMessageContent(message.displayContent)).text).toBe(text)
    expect(getMessagePreviewContent(message)).toBe('你好 [表情] [表情]')
    expect(message.replyTo?.text).toContain('[emoji:builtin_emoji_0001]')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('normalizes sender avatar paths', () => {
    vi.stubEnv('VITE_IM_SERVER_ORIGIN', 'http://im.example.test')

    const message = normalizeMessage({
      messageId: 1,
      conversationId: 2,
      senderId: 3,
      senderAvatar: '/api/files/download/12',
      messageType: 'TEXT',
      content: 'hello',
    })

    expect(message.senderAvatar).toBe('http://im.example.test/api/files/download/12')
  })

  it('uses a readable preview instead of exposing image JSON', () => {
    const content = JSON.stringify({ fileId: '60', url: '/api/files/download/60' })
    const message = normalizeMessage({
      messageId: 1,
      conversationId: 2,
      senderId: 3,
      messageType: 'IMAGE',
      content,
    })

    expect(message.displayContent).toBe('[图片]')
    expect(getMessagePreviewContent(message)).toBe('[图片]')
    expect(getMessagePreviewContent({ messageType: 'IMAGE', content })).toBe('[图片]')
  })

  it('creates readable previews for structured text and attachments', () => {
    expect(getMessagePreviewContent({
      messageType: 'TEXT',
      content: JSON.stringify({ text: '你好', mentions: [] }),
    })).toBe('你好')
    expect(getMessagePreviewContent({
      messageType: 'FILE',
      content: JSON.stringify({ transferMode: 'p2p_lan', name: '说明.pdf' }),
    })).toBe('[文件] 说明.pdf')
    expect(getMessagePreviewContent({
      messageType: 'FOLDER',
      content: JSON.stringify({ transferMode: 'p2p_lan', name: '项目资料' }),
    })).toBe('[文件夹] 项目资料')
  })

  it('does not expose legacy object-storage attachment metadata', () => {
    expect(getMessagePreviewContent({
      messageType: 'FILE',
      content: JSON.stringify({ transferMode: 'object_storage', fileName: '旧文件.pdf' }),
    })).toBe('[文件]')
    expect(getMessagePreviewContent({
      messageType: 'FOLDER',
      content: JSON.stringify({ folderName: '旧文件夹', files: [] }),
    })).toBe('[文件夹]')
  })
})
