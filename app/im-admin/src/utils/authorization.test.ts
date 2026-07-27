import { describe, expect, it } from 'vitest'
import { isAuthorizedAdmin } from './authorization'

describe('isAuthorizedAdmin', () => {
    it('requires both a token and the current admin role', () => {
        expect(isAuthorizedAdmin('token', 'admin')).toBe(true)
        expect(isAuthorizedAdmin('token', 'user')).toBe(false)
        expect(isAuthorizedAdmin('', 'admin')).toBe(false)
    })
})
