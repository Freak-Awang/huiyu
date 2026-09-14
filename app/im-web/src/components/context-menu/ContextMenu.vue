<template>
  <Teleport to="body">
    <div :class="{ 'dark-theme': dark }" class="context-menu-host">
      <Transition name="context-menu">
        <div v-if="session">
          <ContextMenuPanel :key="session.id" :items="items" :anchor="session" :label="session.label"
            @action="execute" @close="closeContextMenu(true)" @back="closeContextMenu(true)" />
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import ContextMenuPanel from './ContextMenuPanel.vue'
import { useContextMenu } from './useContextMenu'
import type { ContextMenuItem } from './types'
defineProps<{ dark?: boolean }>()
const emit = defineEmits<{ error: [message: string] }>()
const { session, closeContextMenu } = useContextMenu()
const clock = ref(0)
// Re-evaluate cached local permissions, status and recall deadlines while the menu is visible.
const items = computed(() => { void clock.value; return session.value?.items().filter(item => item.visible !== false) || [] })
let ticker: ReturnType<typeof setInterval>
function outside(event: Event) {
  if (!(event.target instanceof Element && event.target.closest('[data-context-menu]'))) closeContextMenu()
}
function dismiss() { closeContextMenu() }
async function execute(item: ContextMenuItem) {
  if (!session.value || item.disabled || !item.action) return
  closeContextMenu(true)
  try { await item.action() }
  catch (error) { emit('error', error instanceof Error ? error.message : '操作失败，请重试') }
}
onMounted(() => {
  ticker = setInterval(() => { if (session.value) clock.value++ }, 250)
  document.addEventListener('pointerdown', outside, true)
  document.addEventListener('contextmenu', outside, true)
  document.addEventListener('scroll', outside, true)
  window.addEventListener('resize', dismiss)
  window.addEventListener('blur', dismiss)
})
onUnmounted(() => {
  clearInterval(ticker)
  closeContextMenu()
  document.removeEventListener('pointerdown', outside, true)
  document.removeEventListener('contextmenu', outside, true)
  document.removeEventListener('scroll', outside, true)
  window.removeEventListener('resize', dismiss)
  window.removeEventListener('blur', dismiss)
})
</script>

<style>
.context-menu-host { position: fixed; z-index: 10000; inset: 0; pointer-events: none; }
.context-menu-panel {
  position: fixed; pointer-events: auto; min-width: min(168px, calc(100vw - 12px)); width: max-content;
  max-width: min(240px, calc(100vw - 12px)); max-height: calc(100vh - 12px); overflow-y: auto;
  padding: 6px; border-radius: var(--radius-md); background: var(--bg-surface); color: var(--text-primary);
  border: 1px solid var(--border-subtle); box-shadow: 0 6px 24px rgba(0,0,0,.12); outline: none;
  animation: context-menu-enter 100ms ease-out; -webkit-app-region: no-drag;
}
.context-menu-panel button {
  display: flex; align-items: center; gap: 8px; width: 100%; min-height: 34px; padding: 6px 10px;
  border: 0; border-radius: 4px; background: transparent; color: inherit; font: inherit;
  font-size: var(--font-base); font-weight: 400; text-align: left; cursor: default;
}
.context-menu-panel button.active { background: var(--bg-hover-light); }
.context-menu-panel button.danger.active { background: var(--danger-bg); color: var(--danger); }
.context-menu-panel button[aria-disabled='true'] { color: var(--text-disabled); }
.context-menu-label { flex: 1; overflow-wrap: anywhere; }
.context-menu-shortcut { font-size: 11px; color: var(--text-tertiary); white-space: nowrap; }
.context-menu-icon, .context-menu-arrow { width: 15px; height: 15px; flex: 0 0 15px; }
.context-menu-arrow { stroke: currentColor; fill: none; stroke-width: 1.5; }
.context-menu-separator { height: 1px; margin: 4px 6px; background: var(--border-subtle); }
.context-menu-leave-active { transition: opacity 80ms ease-in; pointer-events: none; }
.context-menu-leave-active .context-menu-panel { pointer-events: none; }
.context-menu-leave-to { opacity: 0; }
@keyframes context-menu-enter { from { opacity: 0; transform: scale(.98); } to { opacity: 1; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .context-menu-panel { animation: none; } .context-menu-leave-active { transition: none; } }
</style>
