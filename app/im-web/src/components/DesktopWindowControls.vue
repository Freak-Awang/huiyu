<!-- Electron 无边框窗口标题栏：浏览器环境不渲染，桌面端提供拖动和原生窗口控制。 -->
<template>
  <div
    v-if="windowControls"
    class="desktop-titlebar"
    :class="{ 'desktop-titlebar-transparent': transparent }"
  >
    <div class="desktop-window-controls">
      <button
        class="desktop-window-button"
        aria-label="最小化"
        type="button"
        @click="minimize"
      >─</button>
      <button
        class="desktop-window-button"
        :aria-label="isMaximized ? '还原' : '最大化'"
        type="button"
        @click="toggleMaximize"
      >{{ isMaximized ? '❐' : '□' }}</button>
      <button
        class="desktop-window-button desktop-window-close"
        aria-label="关闭"
        type="button"
        @click="closeWindow"
      >✕</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

defineProps<{
  transparent?: boolean
}>()

const windowControls = typeof window !== 'undefined' ? window.imDesktop?.window : undefined
const isMaximized = ref(false)
let removeMaximizeListener: (() => void) | null = null

async function minimize() {
  await windowControls?.minimize()
}

async function toggleMaximize() {
  if (!windowControls) return
  isMaximized.value = await windowControls.toggleMaximize()
}

async function closeWindow() {
  await windowControls?.close()
}

onMounted(async () => {
  if (!windowControls) return
  isMaximized.value = await windowControls.isMaximized()
  removeMaximizeListener = windowControls.onMaximizeChanged?.((maximized) => {
    isMaximized.value = maximized
  }) || null
})

onBeforeUnmount(() => {
  removeMaximizeListener?.()
  removeMaximizeListener = null
})
</script>

<style scoped>
.desktop-titlebar {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 1000;
  height: 36px;
  background: var(--bg-header, #f0f0f0);
  border-bottom: 1px solid var(--border-subtle, #e5e5e5);
  -webkit-app-region: drag;
}

.desktop-titlebar-transparent {
  background: transparent;
  border-bottom-color: transparent;
}

.desktop-window-controls {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  height: 36px;
  -webkit-app-region: no-drag;
}

.desktop-window-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--text-tertiary, #777);
  cursor: pointer;
  font-size: 14px;
  transition: background var(--transition-normal, 0.2s), color var(--transition-normal, 0.2s);
}

.desktop-window-button:hover {
  background: var(--bg-hover-light, #e0e0e0);
  color: var(--text-primary, #333);
}

.desktop-window-close:hover {
  background: #e81123;
  color: #fff;
}

.desktop-window-button:focus-visible {
  outline: 2px solid var(--accent, #667eea);
  outline-offset: -2px;
}
</style>
