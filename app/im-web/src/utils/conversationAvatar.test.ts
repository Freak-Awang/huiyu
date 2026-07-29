/**
 * 会话头像测试
 *
 * 测试场景：
 * - 群聊默认头像和文字回退
 * - 自定义头像加载失败后的回退链
 * - 单聊首字回退
 */
import { describe, expect, it } from 'vitest'
import {
  defaultGroupAvatar,
  getConversationAvatarFallback,
  resolveConversationAvatarSource,
} from './conversationAvatar'

describe('conversation avatar resolution', () => {
  it('uses the fixed group asset when no custom avatar exists', () => {
    expect(resolveConversationAvatarSource('GROUP', '')).toBe(defaultGroupAvatar)
    expect(getConversationAvatarFallback('GROUP', '项目讨论群')).toBe('群')
    expect(getConversationAvatarFallback('GROUP', '美术交流')).toBe('群')
  })

  it('uses a custom group avatar until loading fails', () => {
    const source = 'https://cdn.example.test/group.png'
    expect(resolveConversationAvatarSource('GROUP', source)).toBe(source)
    expect(resolveConversationAvatarSource('GROUP', source, true)).toBe(defaultGroupAvatar)
  })

  it('keeps single-chat fallback based on the peer name', () => {
    expect(resolveConversationAvatarSource('SINGLE', '', true)).toBe('')
    expect(getConversationAvatarFallback('SINGLE', '小林')).toBe('小')
  })
})
