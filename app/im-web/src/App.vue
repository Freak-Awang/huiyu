<!-- 应用根组件：承载路由视图与全局更新弹窗，联动登录态初始化和停止在线更新 -->
<template>
  <div class="app-container">
    <div v-if="showBootstrap" class="auth-bootstrap" role="status" aria-live="polite">
      <DesktopWindowControls transparent hide-maximize />
      <p>{{ authStore.restoreError || '正在恢复登录状态…' }}</p>
      <button v-if="authStore.restoreError" :disabled="authStore.restoring" @click="retrySession">
        {{ authStore.restoring ? '正在连接…' : '重新连接' }}
      </button>
    </div>
    <router-view v-else />
    <UpdateDialog />
  </div>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import router from './router'
import { useAuthStore } from './stores/auth'
import { useUpdateStore } from './stores/update'
import UpdateDialog from './components/UpdateDialog.vue'
import DesktopWindowControls from './components/DesktopWindowControls.vue'

const authStore = useAuthStore()
const updateStore = useUpdateStore()
const route = useRoute()
// 网络重试成功后也要等目标路由提交，避免旧的 Login 短暂挂载。
const showBootstrap = computed(() => authStore.authState === 'initializing'
  || route.name !== (authStore.authState === 'authenticated' ? 'Chat' : 'Login'))

// 登录成功后启动在线更新检测，登出后停止
watch(
  () => [authStore.authState, authStore.token] as const,
  ([state, token]) => {
    if (state === 'authenticated') void updateStore.init(token)
    else if (state === 'unauthenticated') void updateStore.stop()
  },
  { immediate: true },
)

watch(() => authStore.authState, async (state) => {
  if (state === 'initializing') return
  await router.isReady()
  if (state !== authStore.authState) return
  await router.replace(state === 'authenticated' ? '/' : '/login')
  if (state !== authStore.authState) return
  await window.imDesktop?.window?.setMode?.(state === 'authenticated' ? 'chat' : 'login')
}, { immediate: true })

function retrySession() {
  if (authStore.authState === 'initializing') void authStore.restoreSession(true)
}
let retryTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  window.addEventListener('online', retrySession)
  retryTimer = setInterval(() => {
    if (authStore.authState === 'initializing' && authStore.restoreError) retrySession()
  }, 5_000)
})
onUnmounted(() => {
  window.removeEventListener('online', retrySession)
  clearInterval(retryTimer)
})
</script>

<style scoped>
.app-container {
  height: 100%;
  width: 100%;
  display: flex;
}
.auth-bootstrap {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #4e5969;
}
.auth-bootstrap button {
  padding: 8px 20px;
  border: 1px solid #dce2ec;
  border-radius: 6px;
  cursor: pointer;
}
</style>
