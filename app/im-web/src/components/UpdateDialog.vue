<!-- 全局更新弹窗：展示新版本日志、下载进度，提供立即更新/稍后提醒/退出时自动安装操作。
     强制更新时不可关闭，阻断使用直至完成更新。 -->
<template>
  <teleport to="body">
    <div v-if="visible" class="update-overlay" :class="{ force: updateStore.isForce }">
      <div class="update-dialog">
        <div class="update-header">
          <span class="update-icon">📦</span>
          <div class="update-title">
            <template v-if="updateStore.status === 'downloaded'">新版本 {{ updateStore.targetVersion }} 已就绪</template>
            <template v-else-if="updateStore.status === 'downloading'">正在下载更新 {{ updateStore.targetVersion }}</template>
            <template v-else>发现新版本 {{ updateStore.targetVersion }}</template>
          </div>
        </div>

        <div v-if="updateStore.changelog.length" class="update-changelog">
          <div class="changelog-title">更新内容：</div>
          <div v-for="(item, index) in updateStore.changelog" :key="index" class="changelog-item">✓ {{ item }}</div>
        </div>

        <div v-if="updateStore.status === 'downloading'" class="update-progress">
          <div class="progress-track">
            <div class="progress-bar" :style="{ width: updateStore.progressPercent + '%' }"></div>
          </div>
          <div class="progress-text">{{ updateStore.progressPercent }}%（{{ formatSize(updateStore.received) }} / {{ formatSize(updateStore.total) }}）</div>
        </div>

        <div v-if="updateStore.error" class="update-error">{{ updateStore.error }}</div>

        <label v-if="!updateStore.isForce && updateStore.status !== 'downloading'" class="install-on-quit">
          <input
            type="checkbox"
            :checked="updateStore.installOnQuit"
            @change="updateStore.toggleInstallOnQuit(($event.target as HTMLInputElement).checked)"
          />
          退出时自动安装
        </label>

        <div class="update-actions">
          <button
            v-if="updateStore.status === 'downloaded'"
            class="btn primary"
            @click="updateStore.quitAndInstall()"
          >立即重启更新</button>
          <button
            v-if="!updateStore.isForce"
            class="btn"
            @click="updateStore.dismiss()"
          >稍后提醒</button>
        </div>

        <div v-if="updateStore.isForce" class="force-tip">本次为强制安全更新，完成后方可继续使用</div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
/**
 * 更新弹窗组件：消费 update store 状态，强制更新时全屏阻断。
 */
import { computed } from 'vue'
import { useUpdateStore } from '../stores/update'

const updateStore = useUpdateStore()
const visible = computed(() => updateStore.dialogVisible)

function formatSize(bytes?: number) {
  const value = bytes || 0
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}
</script>

<style scoped>
.update-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.update-overlay.force {
  background: rgba(0, 0, 0, 0.65);
}

.update-dialog {
  width: 380px;
  background: #fff;
  border-radius: 10px;
  padding: 20px 24px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.update-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.update-icon {
  font-size: 24px;
}

.update-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2329;
}

.update-changelog {
  background: #f5f6f7;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 13px;
  color: #4e5969;
  max-height: 160px;
  overflow-y: auto;
}

.changelog-title {
  font-weight: 600;
  margin-bottom: 4px;
  color: #1f2329;
}

.changelog-item {
  line-height: 1.8;
}

.update-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-track {
  height: 6px;
  background: #e5e6eb;
  border-radius: 3px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: #3370ff;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 12px;
  color: #86909c;
}

.update-error {
  font-size: 12px;
  color: #f53f3f;
}

.install-on-quit {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #4e5969;
  cursor: pointer;
  user-select: none;
}

.update-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn {
  padding: 7px 16px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  background: #fff;
  color: #4e5969;
  font-size: 13px;
  cursor: pointer;
}

.btn:hover {
  background: #f2f3f5;
}

.btn.primary {
  background: #3370ff;
  border-color: #3370ff;
  color: #fff;
}

.btn.primary:hover {
  background: #2860e1;
}

.force-tip {
  text-align: center;
  font-size: 12px;
  color: #86909c;
}
</style>
