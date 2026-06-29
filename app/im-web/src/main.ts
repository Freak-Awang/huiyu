// ?????main wires Vue, routing, and state plugins before mounting the app.
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
