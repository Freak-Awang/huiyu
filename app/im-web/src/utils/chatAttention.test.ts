import { afterEach, describe, expect, it, vi } from 'vitest'
import { isConversationBeingRead } from './chatAttention'

afterEach(() => vi.unstubAllGlobals())
describe('foreground read and notification policy', () => {
  it.each([
    ['visible', true, true, 'one', true],
    ['visible', false, true, 'one', false],
    ['hidden', true, true, 'one', false],
    ['hidden', false, true, 'one', false],
    ['visible', true, false, 'one', false],
    ['visible', true, true, 'two', false],
  ])('visibility=%s focus=%s bottom=%s current=%s -> reading=%s', (visibility, focus, bottom, current, expected) => {
    vi.stubGlobal('document', { visibilityState: visibility, hasFocus: () => focus })
    expect(isConversationBeingRead('one', current as string, bottom as boolean)).toBe(expected)
  })
})
