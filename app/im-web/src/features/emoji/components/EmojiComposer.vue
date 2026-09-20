<script setup lang="ts">
import { ref } from 'vue'
import { useEmojiComposer } from '../composables/useEmojiComposer'
const props = defineProps<{ modelValue: string; disabled?: boolean; placeholder?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; input: []; keydown: [event: KeyboardEvent]; paste: [event: ClipboardEvent] }>()
const root = ref<HTMLDivElement | null>(null)
const composer = useEmojiComposer(root, props, value => { emit('update:modelValue', value); emit('input') })
function keydown(event: KeyboardEvent): void {
  if (composer.composing.value || event.isComposing || event.keyCode === 229) return
  emit('keydown', event)
  composer.keydown(event)
}
function paste(event: ClipboardEvent): void {
  emit('paste', event) // Keep the existing image/attachment clipboard handler.
  if (event.defaultPrevented) return
  event.preventDefault()
  composer.handle.insertText(event.clipboardData?.getData('text/plain') || '')
}
defineExpose(composer.handle)
</script>

<template>
  <div ref="root" class="emoji-composer" role="textbox" aria-label="输入消息" aria-multiline="true"
    :contenteditable="!disabled" :aria-disabled="disabled" :data-placeholder="placeholder" :data-empty="!composer.text.value"
    @input="composer.commit" @beforeinput="composer.beforeInput" @keydown="keydown" @paste="paste"
    @compositionstart="composer.compositionStart" @compositionend="composer.compositionEnd"
    @keyup="composer.saveRange" @mouseup="composer.saveRange" @focus="composer.saveRange"
    @copy="composer.copy($event)" @cut="composer.copy($event, true)" @dragstart.prevent
    @drop="($event.dataTransfer?.types.includes('Files') ? undefined : $event.preventDefault())" />
</template>

<style scoped>
.emoji-composer { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text-primary); font-family: inherit; outline: none; }
.emoji-composer[data-empty="true"]::before { content: attr(data-placeholder); color: var(--text-placeholder); pointer-events: none; }
.emoji-composer :deep(.composer-emoji-token) { display: inline-block; white-space: nowrap; vertical-align: baseline; user-select: all; }
.emoji-composer :deep(.composer-emoji-token img) { width: 1.35em; height: 1.35em; object-fit: contain; vertical-align: -0.25em; user-select: none; }
</style>
