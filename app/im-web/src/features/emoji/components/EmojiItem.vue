<script setup lang="ts">
import type { BuiltinEmoji } from '../types'
import EmojiImage from './EmojiImage.vue'
defineProps<{ emoji: BuiltinEmoji }>()
defineEmits<{ select: [emoji: BuiltinEmoji] }>()
</script>
<template>
  <button type="button" class="builtin-emoji-item" :title="emoji.label || '表情'" :aria-label="emoji.label || '表情'"
    @mousedown.prevent @click="$emit('select', emoji)"><EmojiImage :emoji="emoji" /></button>
</template>
<style scoped>
.builtin-emoji-item { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--text-secondary); cursor: pointer; --emoji-size: 32px; font-size: 11px; }
.builtin-emoji-item:hover { background: var(--bg-hover-light); }
.builtin-emoji-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
</style>
