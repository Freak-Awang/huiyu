<script setup lang="ts">
import { EMOJI_CATEGORIES } from '../constants'
import type { EmojiPickerCategory } from '../types'
defineProps<{ modelValue: EmojiPickerCategory }>()
defineEmits<{ 'update:modelValue': [category: EmojiPickerCategory] }>()
</script>
<template>
  <div class="builtin-emoji-tabs" role="tablist" aria-label="表情分类">
    <button v-for="category in EMOJI_CATEGORIES" :key="category.id" type="button" role="tab" :title="category.label"
      :aria-label="category.label" :aria-selected="modelValue === category.id" :class="{ active: modelValue === category.id }"
      @click="$emit('update:modelValue', category.id)">{{ category.icon }}</button>
  </div>
</template>
<style scoped>
.builtin-emoji-tabs { display: flex; gap: 1px; padding-top: 8px; border-top: 1px solid var(--border-light); overflow-x: auto; }
button { flex: 1 0 28px; min-width: 28px; height: 32px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--text-secondary); font-size: 20px; cursor: pointer; }
button:hover { background: var(--bg-hover-light); }
button.active { background: var(--accent-bg-active); color: var(--accent); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
</style>
