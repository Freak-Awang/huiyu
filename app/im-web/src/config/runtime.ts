const SERVER_ORIGIN_KEY = 'imServerOrigin'

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

export function isDesktopRuntime() {
  return typeof window !== 'undefined' && (window.location.protocol === 'file:' || !!window.imDesktop)
}

export function normalizeServerOrigin(value: string) {
  const trimmed = stripTrailingSlash(value.trim())
  if (!trimmed) return ''

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  const url = new URL(withProtocol)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('服务器地址必须使用 http 或 https')
  }
  return stripTrailingSlash(url.origin)
}

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

export function setServerOrigin(value: string) {
  const normalized = normalizeServerOrigin(value)
  if (normalized) {
    localStorage.setItem(SERVER_ORIGIN_KEY, normalized)
  } else {
    localStorage.removeItem(SERVER_ORIGIN_KEY)
  }
  return normalized
}

export function getApiBaseUrl() {
  return getServerOrigin()
}

export function getWsBaseUrl() {
  const configuredWsUrl = import.meta.env.VITE_WS_URL || ''
  if (configuredWsUrl) return stripTrailingSlash(configuredWsUrl)

  const origin = getServerOrigin()
  if (origin) {
    return `${origin.replace(/^http/i, 'ws')}/ws/im`
  }

  return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/im`
}

export function toServerUrl(path: string) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path

  const normalized = path.startsWith('/') ? path : `/${path}`
  const origin = getServerOrigin()
  return origin ? `${origin}${normalized}` : normalized
}
