import http from './index'

export function login(username: string, password: string) {
  return http.post('/api/auth/login', { username, password })
}

export function logout() {
  return http.post('/api/auth/logout')
}
