<!-- 应用根组件：承载路由视图和全局更新中心组件 -->
<template>
  <div class="app-container">
    <router-view />
    <UpdateCenter />
  </div>
</template>

<script setup lang="ts">
// 应用根组件：承载路由出口和全局更新提示横幅
import UpdateCenter from './components/UpdateCenter.vue'
</script>

<style scoped>
.app-container {
  height: 100%;
  width: 100%;
  display: flex;
}
</style>
