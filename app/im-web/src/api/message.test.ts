import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./index', () => ({ default: {} }))

import { normalizeMessage } from './message'

describe('message API normalization', () => {
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
})
