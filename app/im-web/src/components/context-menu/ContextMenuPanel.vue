<template>
  <div ref="panel" class="context-menu-panel" data-context-menu role="menu" tabindex="0"
    :aria-label="label" :aria-activedescendant="active >= 0 ? `${uid}-${items[active]?.id}` : undefined"
    :style="{ left: `${position.x}px`, top: `${position.y}px`, transformOrigin: position.origin }"
    @keydown.stop="onKeydown" @mousedown.prevent @contextmenu.prevent.stop>
    <template v-for="(item, index) in items" :key="item.id">
      <div v-if="index > 0 && item.separatorBefore" class="context-menu-separator" role="separator" />
      <button :id="`${uid}-${item.id}`" type="button" role="menuitem" tabindex="-1"
        :aria-disabled="!!item.disabled" :aria-haspopup="item.children?.length ? 'menu' : undefined"
        :aria-expanded="item.children?.length ? submenuId === item.id : undefined"
        :class="{ active: active === index && !item.disabled, danger: item.danger }"
        @mouseenter="activate(index, $event)" @click.stop="choose(item, $event)">
        <span v-if="item.icon" class="context-menu-icon" aria-hidden="true" v-html="item.icon"></span>
        <span class="context-menu-label">{{ item.label }}</span>
        <span v-if="item.shortcut" class="context-menu-shortcut">{{ item.shortcut }}</span>
        <svg v-if="item.children?.length" class="context-menu-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>
      </button>
    </template>
  </div>
  <ContextMenuPanel v-if="submenu" ref="child" :key="submenu.id" :items="submenu.children!.filter(item => item.visible !== false)"
    :anchor="childAnchor" :label="submenu.label" @action="$emit('action', $event)" @close="$emit('close')" @back="back" />
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue'
import { nextEnabledItem, positionMenu, type ContextMenuItem, type MenuAnchor } from './types'
const props = defineProps<{ items: ContextMenuItem[]; anchor: MenuAnchor; label: string }>()
const emit = defineEmits<{ action: [item: ContextMenuItem]; close: []; back: [] }>()
const uid = useId()
const panel = ref<HTMLElement>()
const child = ref<{ focus: () => void }>()
const active = ref(-1)
const submenuId = ref('')
const submenu = computed(() => props.items.find(item => item.id === submenuId.value && !item.disabled && item.children?.length))
const childAnchor = ref<MenuAnchor>({ x: 0, y: 0 })
const position = ref({ x: 6, y: 6, origin: 'top left' })
let observer: ResizeObserver | undefined
function layout() {
  if (!panel.value) return
  // Opening scale animation changes getBoundingClientRect; layout dimensions must remain unscaled.
  position.value = positionMenu(props.anchor, panel.value.offsetWidth, panel.value.offsetHeight, window.innerWidth, window.innerHeight)
}
function focus() { panel.value?.focus({ preventScroll: true }) }
defineExpose({ focus })
function openSubmenu(item: ContextMenuItem, element?: HTMLElement) {
  const rect = element?.getBoundingClientRect()
  if (!rect || item.disabled || !item.children?.length) return
  childAnchor.value = { x: rect.left, right: rect.right, y: rect.top, bottom: rect.bottom }
  submenuId.value = item.id
}
function activate(index: number, event: MouseEvent) {
  const item = props.items[index]
  active.value = index
  focus()
  if (!item) return
  if (item.children?.length) openSubmenu(item, event.currentTarget as HTMLElement)
  else submenuId.value = ''
}
function choose(item: ContextMenuItem, event?: MouseEvent) {
  if (item.disabled) return
  if (item.children?.length) {
    openSubmenu(item, (event?.currentTarget as HTMLElement) || document.getElementById(`${uid}-${item.id}`))
    void nextTick(() => child.value?.focus())
  } else emit('action', item)
}
function back() { submenuId.value = ''; focus() }
function onKeydown(event: KeyboardEvent) {
  if (['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter', ' ', 'Escape', 'Tab'].includes(event.key)) event.preventDefault()
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    submenuId.value = ''
    active.value = nextEnabledItem(props.items, active.value, event.key === 'ArrowDown' ? 1 : -1)
  } else if (event.key === 'Home' || event.key === 'End') {
    submenuId.value = ''
    active.value = nextEnabledItem(props.items, event.key === 'Home' ? -1 : 0, event.key === 'Home' ? 1 : -1)
  } else if (event.key === 'ArrowLeft') emit('back')
  else if (event.key === 'Escape' || event.key === 'Tab') emit('close')
  else if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowRight') {
    const item = props.items[active.value]
    if (item && (event.key !== 'ArrowRight' || item.children?.length)) choose(item)
  }
}
watch(() => props.items, (items, old) => {
  const previous = old[active.value]?.id
  const index = items.findIndex(item => item.id === previous && !item.disabled)
  active.value = index >= 0 ? index : nextEnabledItem(items, -1, 1)
  void nextTick(layout)
})
onMounted(() => {
  active.value = nextEnabledItem(props.items, -1, 1)
  layout()
  focus()
  observer = new ResizeObserver(layout)
  if (panel.value) observer.observe(panel.value)
})
onUnmounted(() => observer?.disconnect())
</script>
