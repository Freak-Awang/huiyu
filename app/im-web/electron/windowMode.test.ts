import { describe, expect, it, vi } from 'vitest'
import { createWindowModeController } from './windowMode'

function mockWindow() {
  let bounds = { x: 100, y: 100, width: 380, height: 500 }
  let minimum = [380, 500]
  let maximized = false
  return {
    getNormalBounds: vi.fn(() => ({ ...bounds })),
    isMaximized: vi.fn(() => maximized),
    unmaximize: vi.fn(() => { maximized = false }),
    maximize: vi.fn(() => { maximized = true }),
    setResizable: vi.fn(),
    setMaximizable: vi.fn(),
    setMinimumSize: vi.fn((width: number, height: number) => { minimum = [width, height] }),
    setBounds: vi.fn((value: typeof bounds) => { bounds = { ...value } }),
    setSize: vi.fn((width: number, height: number) => {
      bounds.width = Math.max(width, minimum[0]!)
      bounds.height = Math.max(height, minimum[1]!)
    }),
    center: vi.fn(() => { bounds.x = 200; bounds.y = 200 }),
  }
}

describe('desktop login/chat window modes', () => {
  it('keeps startup login size and opens the first chat at its default size', () => {
    const window = mockWindow()
    const setMode = createWindowModeController(window)
    expect(setMode('login')).toBe(true)
    expect(window.setSize).not.toHaveBeenCalled()
    setMode('chat')
    expect(window.getNormalBounds()).toEqual({ x: 200, y: 200, width: 820, height: 720 })
    expect(window.setMinimumSize).toHaveBeenLastCalledWith(640, 580)
    expect(window.setResizable).toHaveBeenLastCalledWith(true)
    expect(window.setMaximizable).toHaveBeenLastCalledWith(true)
  })

  it.each([false, true])('restores chat bounds and maximized=%s after logging in again', (maximized) => {
    const window = mockWindow()
    const setMode = createWindowModeController(window)
    setMode('chat')
    const customized = { x: 410, y: 70, width: 1100, height: 800 }
    window.setBounds(customized)
    if (maximized) window.maximize()
    setMode('login')
    expect(window.getNormalBounds()).toEqual({ x: 200, y: 200, width: 380, height: 500 })
    expect(window.isMaximized()).toBe(false)
    expect(window.setResizable).toHaveBeenLastCalledWith(false)
    expect(window.setMaximizable).toHaveBeenLastCalledWith(false)
    setMode('chat')
    expect(window.getNormalBounds()).toEqual(customized)
    expect(window.isMaximized()).toBe(maximized)
  })

  it('does not reset bounds on duplicate navigation or overwrite saved chat state', () => {
    const window = mockWindow()
    const setMode = createWindowModeController(window)
    setMode('chat')
    const customized = { x: 40, y: 60, width: 1000, height: 750 }
    window.setBounds(customized)
    setMode('chat')
    expect(window.getNormalBounds()).toEqual(customized)
    setMode('login')
    setMode('login')
    setMode('chat')
    expect(window.getNormalBounds()).toEqual(customized)
  })

  it('rejects invalid IPC modes without changing window state', () => {
    const window = mockWindow()
    const setMode = createWindowModeController(window)
    for (const value of ['unknown', '', null, undefined, {}, 1]) {
      expect(() => setMode(value)).toThrow('无效的窗口模式')
    }
    expect(window.setSize).not.toHaveBeenCalled()
    expect(window.setResizable).not.toHaveBeenCalled()
  })
})
