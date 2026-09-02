/**
 * 应用入口：负责创建 Vue 实例、挂载路由与 Pinia 状态管理，
 * 并挂载路由与 Pinia 状态管理。
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { setupAutoHideScrollbar } from './utils/autoHideScrollbar'
import './style.css'

setupAutoHideScrollbar()

const app = createApp(App)
app.use(createPinia())
app.use(router)

app.mount('#app')
