import { describe, expect, it } from 'vitest'
import { nextEnabledItem, positionMenu } from './types'

describe('context menu geometry and keyboard navigation', () => {
  it.each([[0, 0], [799, 0], [0, 599], [799, 599], [400, 300]])('keeps a menu inside the viewport at %s,%s', (x, y) => {
    const position = positionMenu({ x, y }, 190, 330, 800, 600)
    expect(position.x).toBeGreaterThanOrEqual(6)
    expect(position.y).toBeGreaterThanOrEqual(6)
    expect(position.x + 190).toBeLessThanOrEqual(794)
    expect(position.y + 330).toBeLessThanOrEqual(594)
  })
  it('opens submenus to the left and upwards when necessary', () => {
    expect(positionMenu({ x: 600, right: 790, y: 500, bottom: 534 }, 190, 200, 800, 600))
      .toEqual({ x: 410, y: 334, origin: 'right bottom' })
  })
  it('supports constrained windows using measured, scrollable menu dimensions', () => {
    expect(positionMenu({ x: 79, y: 119 }, 68, 108, 80, 120)).toEqual({ x: 6, y: 6, origin: 'right bottom' })
  })
  it('wraps navigation and skips hidden or disabled commands', () => {
    const items = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', disabled: true }, { id: 'c', label: 'C', visible: false }, { id: 'd', label: 'D' }]
    expect(nextEnabledItem(items, 0, 1)).toBe(3)
    expect(nextEnabledItem(items, 0, -1)).toBe(3)
    expect(nextEnabledItem(items, 3, 1)).toBe(0)
    expect(nextEnabledItem([], -1, 1)).toBe(-1)
    expect(nextEnabledItem([items[1]!], -1, 1)).toBe(-1)
  })
})
