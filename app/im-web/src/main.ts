/**
 * 应用入口：负责创建 Vue 实例、挂载路由与 Pinia 状态管理，
 * 并根据 URL 参数决定是否进入截图模式（仅渲染截图浮层，不加载完整应用）。
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import ScreenshotOverlay from './components/ScreenshotOverlay.vue'
import router from './router'
import './style.css'

const isScreenshotMode = new URLSearchParams(window.location.search).get('mode') === 'screenshot'
const app = createApp(isScreenshotMode ? ScreenshotOverlay : App)

if (!isScreenshotMode) {
  app.use(createPinia())
  app.use(router)
}

app.mount('#app')
