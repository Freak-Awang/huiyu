import { describe, expect, it, vi } from 'vitest'
import { getNewPasswordError, validateNewPassword } from './passwordPolicy'

describe('new password policy', () => {
  it.each([null, undefined, '', '      ', '\t\n\r   ', '\u00a0'.repeat(6), '\u3000'.repeat(6), '\ufeff'.repeat(6), '\u001c'.repeat(6)])(
    'rejects missing or whitespace-only passwords (%j)', (password) => {
      expect(getNewPasswordError(password)).toBe('密码不能为空或全为空白')
    },
  )

  it('rejects five characters', () => {
    expect(getNewPasswordError('abcde')).toBe('密码需为6至18位')
  })

  it.each(['abcdef', 'a'.repeat(11), 'a'.repeat(12), 'a'.repeat(18), '中'.repeat(18), '😀'.repeat(9), ' abcde '])(
    'accepts valid passwords without trimming (%s)', (password) => {
      expect(getNewPasswordError(password)).toBeUndefined()
    },
  )

  it.each(['a'.repeat(19), '中'.repeat(19), 'a'.repeat(73), '😀'.repeat(9) + 'a'])(
    'rejects passwords longer than 18 (%s)', (password) => {
      expect(getNewPasswordError(password)).toBe('密码需为6至18位')
    },
  )

  it('connects validation to the form callback', () => {
    const callback = vi.fn()
    validateNewPassword!({}, 'abcde', callback, {}, {})
    expect(callback).toHaveBeenLastCalledWith(new Error('密码需为6至18位'))
    validateNewPassword!({}, 'abcdef', callback, {}, {})
    expect(callback).toHaveBeenLastCalledWith(undefined)
  })
})
