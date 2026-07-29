/**
 * 应用入口
 * 创建 Vue 实例，依次挂载 Pinia 状态管理与 Vue Router，最后渲染到 #app 节点。
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
