<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { BuiltinEmoji } from '../types'
import { emojiGridWindow } from '../utils/emojiVirtualGrid'
import EmojiItem from './EmojiItem.vue'
const props = defineProps<{ emojis: readonly BuiltinEmoji[]; category: string }>()
defineEmits<{ select: [emoji: BuiltinEmoji] }>()
const viewport = ref<HTMLDivElement | null>(null)
const width = ref(352)
const height = ref(300)
const scrollTop = ref(0)
let observer: ResizeObserver | undefined
const window = computed(() => emojiGridWindow(props.emojis.length, width.value, height.value, scrollTop.value))
const visible = computed(() => props.emojis.slice(window.value.start, window.value.end))
function measure(): void {
  if (!viewport.value) return
  width.value = viewport.value.clientWidth
  height.value = viewport.value.clientHeight
}
watch(() => props.category, () => { scrollTop.value = 0; if (viewport.value) viewport.value.scrollTop = 0 }, { flush: 'sync' })
onMounted(() => { measure(); observer = new ResizeObserver(measure); if (viewport.value) observer.observe(viewport.value) })
onUnmounted(() => observer?.disconnect())
</script>
<template>
  <div ref="viewport" class="builtin-emoji-viewport" @scroll="scrollTop = ($event.target as HTMLElement).scrollTop">
    <div class="builtin-emoji-spacer" :style="{ height: `${window.totalHeight}px` }">
      <div class="builtin-emoji-grid" :style="{ gridTemplateColumns: `repeat(${window.columns}, 44px)`, transform: `translateY(${window.offset}px)` }">
        <EmojiItem v-for="emoji in visible" :key="emoji.id" :emoji="emoji" @select="$emit('select', $event)" />
      </div>
    </div>
  </div>
</template>
<style scoped>
.builtin-emoji-viewport { height: 300px; max-height: 45vh; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; scrollbar-gutter: stable; }
.builtin-emoji-spacer { position: relative; }
.builtin-emoji-grid { position: absolute; top: 0; left: 0; right: 0; display: grid; grid-auto-rows: 44px; justify-content: center; }
</style>
