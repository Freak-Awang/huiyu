/**
 * isAuthorizedAdmin 单元测试
 * 验证鉴权逻辑必须同时满足"已登录"和"admin 角色"两个条件。
 */
import { describe, expect, it } from 'vitest'
import { isAuthorizedAdmin } from './authorization'

describe('isAuthorizedAdmin', () => {
    it('requires both a token and the current admin role', () => {
        expect(isAuthorizedAdmin('token', 'admin')).toBe(true)
        expect(isAuthorizedAdmin('token', 'user')).toBe(false)
        expect(isAuthorizedAdmin('', 'admin')).toBe(false)
    })
})
