<template>
  <div
    ref="overlayRef"
    class="screenshot-overlay"
    :class="{ 'selection-mode': isSelectionMode }"
    @mousedown="beginSelection"
    @mousemove="updateSelection"
    @mouseup="endSelection"
  >
    <img
      v-if="screenshotDataUrl"
      ref="imageRef"
      class="screenshot-image"
      :src="screenshotDataUrl"
      alt=""
      draggable="false"
    />
    <div v-else class="screenshot-loading">正在准备截图...</div>

    <div v-if="selection" class="selection-rect" :style="selectionStyle"></div>

    <div class="screenshot-toolbar" :style="toolbarStyle" @mousedown.stop @mouseup.stop>
      <button type="button" class="primary" @click="confirmCapture">确认</button>
      <button type="button" @click="startReselect">{{ selectionLabel }}</button>
      <button type="button" @click="cancelCapture">取消</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const overlayRef = ref<HTMLElement | null>(null)
const imageRef = ref<HTMLImageElement | null>(null)
const screenshotDataUrl = ref('')
const selection = ref<Rect | null>(null)
const viewport = ref({ width: window.innerWidth, height: window.innerHeight })
const isSelectionMode = ref(false)
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })

const TOOLBAR_WIDTH = 286
const TOOLBAR_HEIGHT = 44
const EDGE_PADDING = 12
const MIN_SELECTION_SIZE = 8

const selectionLabel = computed(() => (selection.value ? '重新框选' : '框选'))

const selectionStyle = computed(() => {
  const rect = selection.value
  if (!rect) return {}
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  }
})

const toolbarStyle = computed(() => {
  const rect = selection.value
  let left = viewport.value.width / 2 - TOOLBAR_WIDTH / 2
  let top = viewport.value.height - TOOLBAR_HEIGHT - 28

  if (rect && !isFullViewportSelection(rect)) {
    left = rect.x + rect.width / 2 - TOOLBAR_WIDTH / 2
    top = rect.y + rect.height + EDGE_PADDING
    if (top + TOOLBAR_HEIGHT > viewport.value.height - EDGE_PADDING) {
      top = rect.y - TOOLBAR_HEIGHT - EDGE_PADDING
    }
  }

  left = clamp(left, EDGE_PADDING, viewport.value.width - TOOLBAR_WIDTH - EDGE_PADDING)
  top = clamp(top, EDGE_PADDING, viewport.value.height - TOOLBAR_HEIGHT - EDGE_PADDING)

  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${TOOLBAR_WIDTH}px`,
  }
})

function clamp(value: number, min: number, max: number) {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

function isFullViewportSelection(rect: Rect) {
  return (
    rect.x <= 0 &&
    rect.y <= 0 &&
    rect.width >= viewport.value.width - 1 &&
    rect.height >= viewport.value.height - 1
  )
}

function pointFromEvent(event: MouseEvent) {
  return {
    x: clamp(event.clientX, 0, viewport.value.width),
    y: clamp(event.clientY, 0, viewport.value.height),
  }
}

function updateViewport() {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
  if (!selection.value) return

  const rect = selection.value
  selection.value = {
    x: clamp(rect.x, 0, viewport.value.width),
    y: clamp(rect.y, 0, viewport.value.height),
    width: clamp(rect.width, 0, viewport.value.width - rect.x),
    height: clamp(rect.height, 0, viewport.value.height - rect.y),
  }
}

function selectFullScreen() {
  updateViewport()
  selection.value = {
    x: 0,
    y: 0,
    width: viewport.value.width,
    height: viewport.value.height,
  }
}

function startReselect() {
  selection.value = null
  isSelectionMode.value = true
  isDragging.value = false
}

function beginSelection(event: MouseEvent) {
  if (!isSelectionMode.value || event.button !== 0) return

  const point = pointFromEvent(event)
  dragStart.value = point
  selection.value = { x: point.x, y: point.y, width: 0, height: 0 }
  isDragging.value = true
}

function updateSelection(event: MouseEvent) {
  if (!isDragging.value || !isSelectionMode.value) return

  const point = pointFromEvent(event)
  const x = Math.min(dragStart.value.x, point.x)
  const y = Math.min(dragStart.value.y, point.y)
  selection.value = {
    x,
    y,
    width: Math.abs(point.x - dragStart.value.x),
    height: Math.abs(point.y - dragStart.value.y),
  }
}

function endSelection() {
  if (!isDragging.value) return

  isDragging.value = false
  if (!selection.value || selection.value.width < MIN_SELECTION_SIZE || selection.value.height < MIN_SELECTION_SIZE) {
    selection.value = null
    isSelectionMode.value = true
    return
  }
  isSelectionMode.value = false
}

function getEffectiveSelection(): Rect {
  const rect = selection.value
  if (!rect || rect.width < MIN_SELECTION_SIZE || rect.height < MIN_SELECTION_SIZE) {
    return { x: 0, y: 0, width: viewport.value.width, height: viewport.value.height }
  }
  return rect
}

async function ensureImageLoaded() {
  await nextTick()
  const image = imageRef.value
  if (!image) throw new Error('Screenshot image is not ready.')
  if (image.complete && image.naturalWidth > 0) return image
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Screenshot image failed to load.'))
  })
  return image
}

async function confirmCapture() {
  if (!window.imScreenshot || !screenshotDataUrl.value) return

  try {
    const image = await ensureImageLoaded()
    const rect = getEffectiveSelection()
    const scaleX = image.naturalWidth / viewport.value.width
    const scaleY = image.naturalHeight / viewport.value.height
    const sx = Math.round(rect.x * scaleX)
    const sy = Math.round(rect.y * scaleY)
    const sw = Math.max(1, Math.round(rect.width * scaleX))
    const sh = Math.max(1, Math.round(rect.height * scaleY))

    const canvas = document.createElement('canvas')
    canvas.width = sw
    canvas.height = sh
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available.')
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh)
    await window.imScreenshot.confirm(canvas.toDataURL('image/png'))
  } catch {
    await cancelCapture()
  }
}

async function cancelCapture() {
  await window.imScreenshot?.cancel()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    void cancelCapture()
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    void confirmCapture()
  }
}

onMounted(async () => {
  window.addEventListener('resize', updateViewport)
  window.addEventListener('keydown', handleKeydown)

  const payload = await window.imScreenshot?.getInitialData()
  if (!payload?.dataUrl) {
    await cancelCapture()
    return
  }
  screenshotDataUrl.value = payload.dataUrl
  selectFullScreen()
  overlayRef.value?.focus()
})

onUnmounted(() => {
  window.removeEventListener('resize', updateViewport)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.screenshot-overlay {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #111;
  cursor: default;
  user-select: none;
}

.screenshot-overlay.selection-mode {
  cursor: crosshair;
}

.screenshot-image {
  width: 100vw;
  height: 100vh;
  display: block;
  object-fit: fill;
  pointer-events: none;
}

.screenshot-loading {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 14px;
}

.selection-rect {
  position: absolute;
  border: 2px solid #4f8cff;
  background: rgba(79, 140, 255, 0.08);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.36);
  pointer-events: none;
}

.screenshot-toolbar {
  position: absolute;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 6px;
  border-radius: 8px;
  background: rgba(24, 28, 36, 0.94);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.3);
}

.screenshot-toolbar button {
  height: 32px;
  min-width: 76px;
  padding: 0 14px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 14px;
}

.screenshot-toolbar button:hover {
  background: rgba(255, 255, 255, 0.2);
}

.screenshot-toolbar button.primary {
  border-color: #4f8cff;
  background: #4f8cff;
}

.screenshot-toolbar button.primary:hover {
  background: #3f7ae2;
}
</style>
