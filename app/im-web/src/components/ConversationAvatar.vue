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

const customSourceFailed = ref(false)
const defaultSourceFailed = ref(false)

watch(() => props.src, () => {
  customSourceFailed.value = false
})

const resolvedSource = computed(() => resolveConversationAvatarSource(
  props.type,
  props.src,
  customSourceFailed.value,
  defaultSourceFailed.value,
))

const fallbackText = computed(() => getConversationAvatarFallback(props.type, props.name))

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
