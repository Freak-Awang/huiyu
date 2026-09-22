import { describe, expect, it } from 'vitest'
import { formatChatTime, normalizeChatTime } from './chatTime'

describe('chat time', () => {
  const now = new Date(2026, 8, 22, 16, 0)

  it('does not add eight hours to a legacy local timestamp', () => {
    const value = normalizeChatTime('2026-09-22T15:38:00')
    expect(new Date(value).getTime()).toBe(new Date(2026, 8, 22, 15, 38).getTime())
    expect(formatChatTime(value, now)).toBe('15:38')
    expect(normalizeChatTime(value)).toBe(value)
  })

  it.each([
    '2026-09-22T15:38:00+08:00',
    '2026-09-22T07:38:00Z',
    Date.parse('2026-09-22T07:38:00Z'),
    String(Date.parse('2026-09-22T07:38:00Z')),
  ])('preserves the instant represented by %s', value => {
    expect(normalizeChatTime(value)).toBe('2026-09-22T07:38:00.000Z')
  })

  it('uses local calendar dates for today, yesterday and older messages', () => {
    const at = (day: number, hour: number, minute: number) => new Date(2026, 8, day, hour, minute).toISOString()
    expect(formatChatTime(at(22, 0, 5), now)).toBe('00:05')
    expect(formatChatTime(at(21, 23, 55), now)).toBe('昨天 23:55')
    expect(formatChatTime(at(14, 15, 2), now)).toBe('9/14 15:02')
  })

  it.each([undefined, null, '', ' ', 'invalid', NaN, Infinity, 1e20])('ignores missing or invalid timestamps: %s', value => {
    expect(normalizeChatTime(value)).toBe('')
    expect(formatChatTime(normalizeChatTime(value), now)).toBe('')
  })
})
