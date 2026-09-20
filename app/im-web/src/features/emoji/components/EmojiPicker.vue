<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useEmojiCatalog } from '../composables/useEmojiCatalog'
import { useRecentEmoji } from '../composables/useRecentEmoji'
import { EMOJI_CATEGORIES } from '../constants'
import type { BuiltinEmoji, EmojiPickerCategory } from '../types'
import EmojiGrid from './EmojiGrid.vue'
import EmojiCategoryTabs from './EmojiCategoryTabs.vue'
const emit = defineEmits<{ select: [emoji: BuiltinEmoji] }>()
const { error, getEmojisByCategory } = useEmojiCatalog()
const recent = useRecentEmoji()
const active = ref<EmojiPickerCategory>('smile')
const loading = ref(true)
let disposed = false
const emojis = computed(() => active.value === 'recent' ? recent.emojis.value : getEmojisByCategory(active.value))
const label = computed(() => EMOJI_CATEGORIES.find(category => category.id === active.value)?.label)
function select(emoji: BuiltinEmoji): void { emit('select', emoji); recent.rememberEmoji(emoji.id) }
onMounted(async () => {
  try { await recent.loadRecentEmoji(); if (!disposed && recent.ids.value.length) active.value = 'recent' }
  catch { /* Catalog owns the shared error state. */ }
  finally { if (!disposed) loading.value = false }
})
onUnmounted(() => { disposed = true })
</script>
<template>
  <section class="builtin-emoji-picker" aria-label="内置表情" :aria-busy="loading">
    <div class="builtin-emoji-heading">{{ label }}<span v-if="!loading && !error">{{ emojis.length }}</span></div>
    <div v-if="loading || error || !emojis.length" class="builtin-emoji-status" role="status">{{ error || (loading ? '正在加载表情…' : '使用过的表情会显示在这里') }}</div>
    <EmojiGrid v-else :emojis="emojis" :category="active" @select="select" />
    <EmojiCategoryTabs v-model="active" />
  </section>
</template>
<style scoped>
.builtin-emoji-picker { display: flex; flex-direction: column; gap: 8px; color: var(--text-primary); }
.builtin-emoji-heading { display: flex; align-items: center; justify-content: space-between; font-size: var(--font-sm); color: var(--text-secondary); padding: 2px 5px; }
.builtin-emoji-heading span { color: var(--text-tertiary); }
.builtin-emoji-status { height: 300px; max-height: 45vh; display: grid; place-items: center; color: var(--text-tertiary); font-size: var(--font-sm); }
</style>
