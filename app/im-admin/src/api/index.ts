/**
 * Axios 实例与全局拦截器
 * 统一处理请求头注入、响应解包、错误提示及 401 跳转登录页。
 */
import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '../router'

const client = axios.create({
    baseURL: import.meta.env.PROD ? '' : 'http://172.16.59.253',
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
})

// 请求拦截器：自动携带 token
client.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

// 响应拦截器：统一解包 code/data 结构，处理业务错误与 HTTP 错误
client.interceptors.response.use(
    (response) => {
        const body = response.data
        if (body && typeof body === 'object' && 'code' in body && 'data' in body) {
            if (body.code === 200) {
                response.data = body.data
                return response
            }
            const message = body.message || '请求失败'
            ElMessage.error(message)
            if (body.code === 401) {
                localStorage.removeItem('token')
                localStorage.removeItem('user')
                router.push('/login')
            }
            const error = new Error(message) as Error & { response?: typeof response }
            error.response = { ...response, status: body.code, data: body }
            return Promise.reject(error)
        }
        return response
    },
    (error) => {
        if (error.response) {
            const { status, data } = error.response
            const msg = data?.message || data?.msg || '请求失败'
            switch (status) {
                case 401:
                    ElMessage.error('登录已过期，请重新登录')
                    localStorage.removeItem('token')
                    localStorage.removeItem('user')
                    router.push('/login')
                    break
                case 403:
                    ElMessage.error('无权限访问')
                    break
                default:
                    ElMessage.error(msg)
            }
        } else {
            ElMessage.error('网络异常，请稍后重试')
        }
        return Promise.reject(error)
    },
)

export default client
