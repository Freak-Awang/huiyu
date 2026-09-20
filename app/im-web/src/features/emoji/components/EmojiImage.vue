<script setup lang="ts">
import { ref, watch } from 'vue'
import type { BuiltinEmoji } from '../types'
import { getBuiltinEmojiUrl } from '../utils/emojiUrl'
const props = defineProps<{ emoji?: BuiltinEmoji }>()
const failed = ref(false)
watch(() => props.emoji?.id, () => { failed.value = false })
function onError(): void {
  failed.value = true
  if (import.meta.env.DEV) console.warn('Emoji image unavailable', props.emoji?.id, props.emoji?.file)
}
</script>
<template>
  <img v-if="emoji && !failed" class="inline-emoji" :data-emoji-id="emoji.id" :src="getBuiltinEmojiUrl(emoji.file)"
    alt="[表情]" :title="emoji.label || '表情'" loading="lazy" decoding="async" draggable="false" @error="onError" />
  <span v-else class="emoji-fallback">[表情]</span>
</template>
<style scoped>
.inline-emoji { width: var(--emoji-size, 1.35em); height: var(--emoji-size, 1.35em); object-fit: contain; vertical-align: -0.25em; user-select: none; }
.emoji-fallback { font-size: inherit; }
</style>
