import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./index', () => ({ default: {} }))

import { normalizeConversation } from './conversation'

describe('conversation API normalization', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('normalizes conversation and member avatar paths', () => {
    vi.stubEnv('VITE_IM_SERVER_ORIGIN', 'http://im.example.test')

    const conversation = normalizeConversation({
      conversationId: 1,
      type: 1,
      avatar: '/api/files/download/10',
      members: [{ userId: 2, avatar: '/api/files/download/11' }],
    })

    expect(conversation.avatar).toBe('http://im.example.test/api/files/download/10')
    expect(conversation.members?.[0]?.avatar).toBe('http://im.example.test/api/files/download/11')
  })

  it('keeps absolute avatar URLs unchanged', () => {
    const conversation = normalizeConversation({
      conversationId: 1,
      type: 2,
      avatar: 'https://cdn.example.test/group.png',
    })

    expect(conversation.avatar).toBe('https://cdn.example.test/group.png')
  })
})
