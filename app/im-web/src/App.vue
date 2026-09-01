<!-- 应用根组件：承载路由视图与全局更新弹窗，联动登录态初始化和停止在线更新 -->
<template>
  <div class="app-container">
    <router-view />
    <UpdateDialog />
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { useAuthStore } from './stores/auth'
import { useUpdateStore } from './stores/update'
import UpdateDialog from './components/UpdateDialog.vue'

const authStore = useAuthStore()
const updateStore = useUpdateStore()

// 登录成功后启动在线更新检测，登出后停止
watch(
  () => authStore.token,
  (token) => {
    if (token) {
      void updateStore.init(token)
    } else {
      void updateStore.stop()
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.app-container {
  height: 100%;
  width: 100%;
  display: flex;
}
</style>
