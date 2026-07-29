/**
 * 运行时配置中心：集中管理服务器地址、API 基础路径与 WebSocket 地址，
 * 支持从环境变量、localStorage 读取配置，并提供地址规范化与校验能力。
 */
const SERVER_ORIGIN_KEY = 'imServerOrigin'

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function isLoopbackHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/**
 * 判断当前是否为桌面端（Electron）运行环境。
 * @returns 是桌面端返回 true，否则返回 false
 */
export function isDesktopRuntime() {
  return typeof window !== 'undefined' && (window.location.protocol === 'file:' || !!window.imDesktop)
}

/**
 * 规范化服务器地址：补全协议、去除末尾斜杠，并校验协议合法性。
 * 生产环境（非桌面端）强制要求 HTTPS，本地回环地址除外。
 * @param value 原始服务器地址字符串
 * @returns 规范化后的服务器 origin
 * @throws 地址为空或协议不合法时抛出异常
 */
export function normalizeServerOrigin(value: string) {
  const trimmed = stripTrailingSlash(value.trim())
  if (!trimmed) return ''

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  const url = new URL(withProtocol)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('服务器地址必须使用 http 或 https')
  }
  if (import.meta.env.PROD && !isDesktopRuntime() && url.protocol !== 'https:' && !isLoopbackHostname(url.hostname)) {
    throw new Error('Production server addresses must use HTTPS')
  }
  return stripTrailingSlash(url.origin)
}

/**
 * 获取当前生效的服务器地址。
 * 优先级：localStorage 用户配置 > 环境变量 > 开发环境默认 localhost:8080。
 * @returns 服务器 origin，未配置时返回空字符串
 */
export function getServerOrigin() {
  const envOrigin = import.meta.env.VITE_IM_SERVER_ORIGIN || import.meta.env.VITE_API_BASE_URL || ''
  const savedOrigin = typeof window !== 'undefined' ? localStorage.getItem(SERVER_ORIGIN_KEY) || '' : ''
  const rawOrigin = savedOrigin || envOrigin

  if (rawOrigin) {
    try {
      return normalizeServerOrigin(rawOrigin)
    } catch {
      return ''
    }
  }

  if (!import.meta.env.PROD) {
    return 'http://localhost:8080'
  }

  return ''
}

/**
 * 保存服务器地址到 localStorage。
 * @param value 待保存的服务器地址，空字符串表示清除配置
 * @returns 规范化后的地址
 */
export function setServerOrigin(value: string) {
  const normalized = normalizeServerOrigin(value)
  if (normalized) {
    localStorage.setItem(SERVER_ORIGIN_KEY, normalized)
  } else {
    localStorage.removeItem(SERVER_ORIGIN_KEY)
  }
  return normalized
}

/**
 * 获取 REST API 基础路径。
 * @returns API baseURL
 */
export function getApiBaseUrl() {
  return getServerOrigin()
}

/**
 * 获取 WebSocket 连接地址。
 * 优先使用环境变量 VITE_WS_URL；否则根据服务器 origin 推导 ws/wss 地址。
 * @returns WebSocket 完整连接地址
 */
export function getWsBaseUrl() {
  const configuredWsUrl = import.meta.env.VITE_WS_URL || ''
  if (configuredWsUrl) return stripTrailingSlash(configuredWsUrl)

  const origin = getServerOrigin()
  if (origin) {
    return `${origin.replace(/^http/i, 'ws')}/ws/im`
  }

  return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/im`
}

/**
 * 将相对路径转换为完整服务器 URL；已是绝对地址则原样返回。
 * @param path 服务器相对路径或绝对 URL
 * @returns 完整可访问 URL
 */
export function toServerUrl(path: string) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path

  const normalized = path.startsWith('/') ? path : `/${path}`
  const origin = getServerOrigin()
  return origin ? `${origin}${normalized}` : normalized
}
