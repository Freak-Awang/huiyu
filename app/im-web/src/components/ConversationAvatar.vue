<!-- 会话头像组件：根据会话类型（单聊/群聊）显示头像图片或文字回退 -->
<template>
  <span
    class="conversation-avatar"
    :style="{ width: `${size}px`, height: `${size}px`, minWidth: `${size}px` }"
  >
    <img v-if="resolvedSource" :src="resolvedSource" :alt="alt" @error="handleError" />
    <span v-else aria-hidden="true">{{ fallbackText }}</span>
    <slot />
  </span>
</template>

<script setup lang="ts">
// 会话头像：根据类型和加载状态解析头像源，支持图片加载失败后回退到文字头像
import { computed, ref, watch } from 'vue'
import {
  defaultGroupAvatar,
  getConversationAvatarFallback,
  resolveConversationAvatarSource,
} from '../utils/conversationAvatar'

const props = withDefaults(defineProps<{
  type: 'SINGLE' | 'GROUP'
  src?: string
  name?: string
  alt?: string
  size?: number
}>(), {
  src: '',
  name: '',
  alt: '会话头像',
  size: 40,
})

const customSourceFailed = ref(false) // 自定义头像加载失败标记
const defaultSourceFailed = ref(false) // 默认群头像也加载失败的最终兜底标记

// 头像 src 变化时重置自定义头像失败状态
watch(() => props.src, () => {
  customSourceFailed.value = false
})

// 解析最终显示的头像源：自定义 -> 默认群头像 -> 无
const resolvedSource = computed(() => resolveConversationAvatarSource(
  props.type,
  props.src,
  customSourceFailed.value,
  defaultSourceFailed.value,
))

// 当图片不可用时显示的文字回退（首字母）
const fallbackText = computed(() => getConversationAvatarFallback(props.type, props.name))

// 图片加载失败处理：先尝试自定义源失败，再是默认源失败
function handleError() {
  if (resolvedSource.value === defaultGroupAvatar) {
    defaultSourceFailed.value = true
    console.warn('群聊默认头像资源加载失败，已回退为文本头像')
    return
  }
  customSourceFailed.value = true
  console.warn('会话头像资源加载失败，已使用默认头像', props.src)
}
</script>

<style scoped>
.conversation-avatar {
  position: relative;
  border-radius: 50%;
  background: var(--accent-avatar, #5868d8);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  overflow: hidden;
  font-size: 1.15em;
  font-weight: 600;
  line-height: 1;
}

.conversation-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
