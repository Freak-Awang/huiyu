<script setup lang="ts">
import { computed, watch } from 'vue'
import { getEmojiById, loadEmojiCatalog } from '../composables/useEmojiCatalog'
import { parseEmojiMessage } from '../utils/emojiParser'
import { emojiMessageSize } from '../utils/emojiMessage'
import EmojiImage from './EmojiImage.vue'
const props = defineProps<{ text: string; compact?: boolean }>()
const segments = computed(() => parseEmojiMessage(props.text))
const size = computed(() => props.compact ? '1.35em' : emojiMessageSize(segments.value))
watch(segments, value => {
  if (value.some(segment => segment.type === 'emoji')) void loadEmojiCatalog().catch(() => undefined)
}, { immediate: true })
</script>
<template>
  <span class="emoji-renderer" :style="{ '--emoji-size': size }"><template v-for="(segment, index) in segments" :key="`${index}:${segment.type === 'emoji' ? segment.id : 'text'}`"><EmojiImage v-if="segment.type === 'emoji'" :emoji="getEmojiById(segment.id)" /><slot v-else name="text" :text="segment.text">{{ segment.text }}</slot></template></span>
</template>
<style scoped>
.emoji-renderer { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
