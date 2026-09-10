/**
 * 应用入口：负责创建 Vue 实例、挂载路由与 Pinia 状态管理，
 * 并挂载路由与 Pinia 状态管理。
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import { configureSessionRecovery } from './api'
import { setupAutoHideScrollbar } from './utils/autoHideScrollbar'
import './style.css'

setupAutoHideScrollbar()

const app = createApp(App)
app.use(createPinia())
const authStore = useAuthStore()
configureSessionRecovery(async () => {
  await authStore.restoreSession(true)
  if (authStore.restoreError) throw new Error('暂时无法验证登录状态')
  return authStore.isLoggedIn
}, () => authStore.clearAuth())
app.use(router)

app.mount('#app')
