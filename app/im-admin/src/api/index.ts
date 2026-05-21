import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '../router'

const client = axios.create({
    baseURL: import.meta.env.PROD ? '' : 'http://localhost:8080',
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

client.interceptors.response.use(
    (response) => {
        const body = response.data
        if (body && typeof body === 'object' && 'code' in body && 'data' in body) {
            if (body.code === 200) {
                response.data = body.data
            }
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
