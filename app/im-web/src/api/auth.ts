/**
 * 认证相关 API：封装登录、登出及 WebSocket 票据获取接口。
 */
import http from './index'

/**
 * 用户登录。
 * 调用 POST /api/auth/login
 * @param username 用户名
 * @param password 密码
 * @returns 包含 token 与用户信息的响应
 */
export function login(username: string, password: string) {
  return http.post('/api/auth/login', { username, password })
}

/**
 * 用户登出。
 * 调用 POST /api/auth/logout
 * @returns 登出结果
 */
export function logout() {
  return http.post('/api/auth/logout')
}

/**
 * 创建 WebSocket 连接票据，用于建立实时通信通道。
 * 调用 POST /api/auth/ws-ticket
 * @returns WebSocket 连接票据字符串
 */
export async function createWebSocketTicket() {
  const response = await http.post<{ ticket: string }>('/api/auth/ws-ticket')
  return response.data.ticket
}
