/**
 * 用户 API 单元测试：验证用户数据规范化逻辑（如头像路径转换）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./index', () => ({ default: {} }))

import { normalizeUser } from './user'

describe('user API normalization', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('turns contact avatar paths into server URLs', () => {
    vi.stubEnv('VITE_IM_SERVER_ORIGIN', 'http://im.example.test')

    expect(normalizeUser({ id: 7, deptId: 2, avatar: '/api/files/download/9' })).toMatchObject({
      userId: '7',
      deptId: '2',
      avatar: 'http://im.example.test/api/files/download/9',
    })
  })

  it('keeps absolute avatar URLs unchanged', () => {
    expect(normalizeUser({ userId: '8', avatar: 'https://cdn.example.test/avatar.png' }).avatar)
      .toBe('https://cdn.example.test/avatar.png')
  })
})
