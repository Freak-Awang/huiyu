import axios from 'axios'
import router from '../router'

const http = axios.create({
  baseURL: import.meta.env.PROD ? '' : 'http://localhost:8080',
  timeout: 15000,
})

http.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

http.interceptors.response.use(
  (response) => {
    const body = response.data
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 200) {
        response.data = body.data
        return response
      }
      if (body.code === 401) {
        localStorage.removeItem('token')
        router.push('/login')
      }
      const error = new Error(body.message || '请求失败') as Error & {
        response?: typeof response
      }
      error.response = {
        ...response,
        status: body.code === 401 ? 401 : response.status,
        data: body,
      }
      return Promise.reject(error)
    }
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      router.push('/login')
    }
    return Promise.reject(error)
  }
)

export default http
