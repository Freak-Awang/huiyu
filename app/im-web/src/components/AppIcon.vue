<!-- 内联 SVG 图标：通过 currentColor 由 CSS 控制颜色，配合 ?raw 导入本地 SVG -->
<template>
  <span class="app-icon" role="img" :aria-label="label || undefined" :aria-hidden="label ? undefined : 'true'" v-html="svg"></span>
</template>

<script setup lang="ts">
defineProps<{
  /** ?raw 方式导入的 SVG 字符串 */
  svg: string
  label?: string
}>()
</script>

<style scoped>
.app-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  color: inherit;
  flex-shrink: 0;
}

.app-icon :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

.app-icon :deep(svg),
.app-icon :deep(svg [fill]) {
  fill: currentColor;
}
</style>
