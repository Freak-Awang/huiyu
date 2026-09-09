import type { BrowserWindow, Rectangle } from 'electron'

export const LOGIN_WINDOW_SIZE = { width: 380, height: 500 }
export const CHAT_WINDOW_SIZE = { width: 820, height: 720 }
export const CHAT_WINDOW_MIN_SIZE = { width: 640, height: 580 }

type ModeWindow = Pick<BrowserWindow,
  'getNormalBounds' | 'isMaximized' | 'unmaximize' | 'maximize' |
  'setResizable' | 'setMaximizable' | 'setMinimumSize' | 'setBounds' | 'setSize' | 'center'
>

/** 每个原生窗口独立保存聊天布局；路由重复通知不会重置用户调整的窗口。 */
export function createWindowModeController(window: ModeWindow) {
  let mode: 'login' | 'chat' = 'login'
  let chatState: { bounds: Rectangle; maximized: boolean } | undefined

  return (nextMode: unknown): boolean => {
    if (nextMode !== 'login' && nextMode !== 'chat') {
      throw new Error('无效的窗口模式')
    }
    if (nextMode === mode) return true

    if (nextMode === 'login') {
      chatState = { bounds: window.getNormalBounds(), maximized: window.isMaximized() }
      if (chatState.maximized) window.unmaximize()
      window.setMinimumSize(LOGIN_WINDOW_SIZE.width, LOGIN_WINDOW_SIZE.height)
      window.setSize(LOGIN_WINDOW_SIZE.width, LOGIN_WINDOW_SIZE.height)
      window.center()
      window.setResizable(false)
      window.setMaximizable(false)
    } else {
      window.setResizable(true)
      window.setMaximizable(true)
      window.setMinimumSize(CHAT_WINDOW_MIN_SIZE.width, CHAT_WINDOW_MIN_SIZE.height)
      if (chatState) {
        window.setBounds(chatState.bounds)
        if (chatState.maximized) window.maximize()
      } else {
        window.setSize(CHAT_WINDOW_SIZE.width, CHAT_WINDOW_SIZE.height)
        window.center()
      }
    }
    mode = nextMode
    return true
  }
}
