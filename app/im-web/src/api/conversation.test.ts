import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const httpMock = vi.hoisted(() => ({
  post: vi.fn(),
  delete: vi.fn(),
  put: vi.fn(),
}))

vi.mock('./index', () => ({ default: httpMock }))

import {
  normalizeConversation,
  restoreDefaultGroupAvatar,
  transferConversationOwner,
  uploadGroupAvatar,
} from './conversation'

describe('conversation API normalization', () => {
  beforeEach(() => vi.clearAllMocks())
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
    expect(conversation.avatarType).toBe('custom')
  })

  it('normalizes explicit group avatar state and permissions', () => {
    const conversation = normalizeConversation({
      conversationId: 1,
      type: 2,
      avatarType: 'default',
      ownerId: 10,
      canEditAvatar: true,
      avatarUpdatedBy: 10,
      avatarUpdatedAt: '2026-07-29T12:00:00',
    })

    expect(conversation).toMatchObject({
      avatar: '',
      avatarType: 'default',
      ownerId: '10',
      canEditAvatar: true,
      avatarUpdatedBy: '10',
      avatarUpdatedAt: '2026-07-29T12:00:00',
    })
  })

  it('calls the dedicated group avatar endpoints', async () => {
    httpMock.post.mockResolvedValue({
      data: { conversationId: 1, type: 2, avatarType: 'custom', avatar: '/api/files/download/99' },
    })
    httpMock.delete.mockResolvedValue({
      data: { conversationId: 1, type: 2, avatarType: 'default', avatar: null },
    })
    httpMock.put.mockResolvedValue({
      data: { conversationId: 1, type: 2, ownerId: 11, avatarType: 'default' },
    })
    const file = new File(['avatar'], 'group.png', { type: 'image/png' })

    await uploadGroupAvatar('1', file)
    await restoreDefaultGroupAvatar('1')
    await transferConversationOwner('1', '11')

    expect(httpMock.post).toHaveBeenCalledWith(
      '/api/conversations/1/avatar',
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } }),
    )
    expect(httpMock.delete).toHaveBeenCalledWith('/api/conversations/1/avatar')
    expect(httpMock.put).toHaveBeenCalledWith('/api/conversations/1/owner', { newOwnerId: 11 })
  })
})
