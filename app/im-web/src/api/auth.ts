// ?????auth wraps backend API calls so views and stores do not depend on raw HTTP details.
import http from './index'

export function login(username: string, password: string) {
  return http.post('/api/auth/login', { username, password })
}

export function logout() {
  return http.post('/api/auth/logout')
}
