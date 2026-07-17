<template>
  <div v-if="showBanner" class="update-banner" :class="{ force: update.state.forceUpdate }">
    <span>{{ bannerText }}</span>
    <button v-if="update.state.status === 'available'" type="button" @click="update.download()">下载更新</button>
    <button v-else-if="update.state.status === 'downloaded' || update.state.status === 'waiting-for-transfers'" type="button" @click="update.install()">
      {{ update.state.transferBlockers ? '传输完成后安装' : '立即重启安装' }}
    </button>
    <button v-else-if="update.state.status === 'error'" type="button" @click="update.check()">重试</button>
  </div>

  <div v-if="update.state.forceUpdate" class="force-update-overlay">
    <div class="force-update-card">
      <h2>需要更新 ArtTalk</h2>
      <p>当前版本 {{ update.state.currentVersion }} 已停止支持，请升级到 {{ update.state.targetVersion }}。</p>
      <div v-if="update.state.status === 'downloading'" class="progress-track">
        <span :style="{ width: `${Math.max(0, Math.min(100, update.state.percent || 0))}%` }" />
      </div>
      <p v-if="update.state.status === 'downloading'">正在下载 {{ (update.state.percent || 0).toFixed(1) }}%</p>
      <p v-else-if="update.state.error" class="error-text">{{ update.state.error }}</p>
      <button v-if="update.state.status === 'available'" type="button" @click="update.download()">开始下载</button>
      <button v-else-if="update.state.status === 'error'" type="button" @click="update.check()">重新检查</button>
      <button v-else-if="update.state.status === 'downloaded' || update.state.status === 'waiting-for-transfers'" type="button" @click="update.install()">
        {{ update.state.transferBlockers ? '传输完成后安装' : '立即重启安装' }}
      </button>
      <button v-else-if="update.state.status === 'checking'" type="button" disabled>正在检查...</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useUpdateStore } from '../stores/update'
import { useAuthStore } from '../stores/auth'

const update = useUpdateStore()
const auth = useAuthStore()
const route = useRoute()

const showBanner = computed(() => update.needsAttention && !update.state.forceUpdate)
const bannerText = computed(() => {
  if (update.state.status === 'available') return `发现新版本 ${update.state.targetVersion || ''}`
  if (update.state.status === 'downloaded') return `新版本 ${update.state.targetVersion || ''} 已下载完成`
  if (update.state.status === 'waiting-for-transfers') return `更新已就绪，将在 ${update.state.transferBlockers} 个传输任务完成后安装`
  return `更新失败：${update.state.error || '请稍后重试'}`
})

onMounted(() => void update.initialize())
watch([() => route.fullPath, () => auth.token], () => void update.initialize())
onUnmounted(() => update.dispose())
</script>

<style scoped>
.update-banner {
  position: fixed;
  z-index: 1600;
  top: 10px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 360px;
  max-width: calc(100vw - 40px);
  padding: 10px 14px;
  transform: translateX(-50%);
  border: 1px solid #c7d2fe;
  border-radius: 8px;
  background: #eef2ff;
  color: #273142;
  box-shadow: 0 8px 28px rgba(39, 49, 66, 0.16);
}

.update-banner button,
.force-update-card button {
  border: 0;
  border-radius: 6px;
  background: #4f63d8;
  color: white;
  padding: 7px 14px;
  cursor: pointer;
}

.force-update-overlay {
  position: fixed;
  z-index: 2000;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(19, 24, 38, 0.72);
}

.force-update-card {
  width: min(460px, calc(100vw - 40px));
  padding: 32px;
  border-radius: 12px;
  background: white;
  color: #273142;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
}

.force-update-card h2 { margin: 0 0 12px; }
.progress-track { height: 8px; overflow: hidden; border-radius: 999px; background: #e5e7eb; }
.progress-track span { display: block; height: 100%; background: #4f63d8; }
.error-text { color: #c62828; }
</style>
