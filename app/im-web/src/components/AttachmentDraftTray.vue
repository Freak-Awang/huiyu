<!-- 附件草稿托盘：以横向卡片显示待发送的图片和文件 -->
<template>
  <div
    v-if="drafts.length"
    ref="listRef"
    class="attachment-draft-list"
    role="list"
    aria-label="待发送图片和文件"
  >
    <article
      v-for="draft in drafts"
      :key="draft.id"
      class="attachment-draft-item"
      :class="{ 'is-image': draft.kind === 'image', 'has-error': draft.status === 'failed' }"
      role="listitem"
      :tabindex="disabled ? -1 : 0"
      :aria-label="`${kindText(draft)} ${draft.name}，按退格键或 Delete 键移除`"
      :title="`${kindText(draft)}：${draft.name} (${formatFileSize(draft.size)})`"
      @click="focusDraftCard"
      @keydown="handleDraftKeydown($event, draft)"
    >
      <template v-if="draft.kind === 'image'">
        <img
          v-if="draft.previewUrl"
          class="attachment-draft-thumbnail"
          :src="draft.previewUrl"
          :alt="draft.name"
        />
        <span v-else class="attachment-draft-image-placeholder">图片</span>
        <span v-if="draft.status !== 'waiting'" class="attachment-draft-image-status">
          {{ statusText(draft) }}
        </span>
      </template>

      <template v-else>
        <span class="attachment-draft-main">
          <span class="attachment-draft-name">{{ draft.name }}</span>
          <span
            class="attachment-draft-meta"
            :class="{ 'is-status': draft.status !== 'waiting' }"
          >
            {{ draft.status === 'waiting' ? waitingMetaText(draft) : statusText(draft) }}
          </span>
        </span>
        <span class="attachment-draft-icon" aria-hidden="true">
          <svg v-if="draft.kind === 'folder'" viewBox="0 0 24 24" fill="none">
            <path
              d="M3.5 6.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none">
            <path d="M7 3.5h7l4 4V20.5H7z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
            <path d="M14 3.5v4h4M9.5 11.5h6M9.5 14.5h6M9.5 17.5h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </template>

      <div
        class="attachment-draft-controls"
        :class="{ 'is-visible': draft.status !== 'waiting' }"
      >
        <button
          v-if="draft.kind !== 'image' && (draft.status === 'hashing' || draft.status === 'uploading')"
          type="button"
          class="attachment-draft-action"
          @click="$emit('pause', draft)"
        >暂停</button>
        <button
          v-else-if="draft.status === 'paused' || draft.status === 'failed'"
          type="button"
          class="attachment-draft-action"
          :disabled="disabled"
          @click="$emit('retry', draft)"
        >重试</button>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
// 附件草稿托盘：渲染待发送附件列表，格式化文件大小和上传状态文本
import { nextTick, ref } from 'vue'
import type { AttachmentDraft } from '../stores/attachmentDrafts'

const { drafts, disabled } = defineProps<{
  drafts: AttachmentDraft[]
  disabled: boolean
}>()

const emit = defineEmits<{
  remove: [draft: AttachmentDraft]
  pause: [draft: AttachmentDraft]
  retry: [draft: AttachmentDraft]
  focusInput: []
}>()

const listRef = ref<HTMLElement | null>(null)

function getDraftCards() {
  return Array.from(listRef.value?.querySelectorAll<HTMLElement>('.attachment-draft-item') || [])
}

function focusLast() {
  const cards = getDraftCards()
  cards[cards.length - 1]?.focus()
}

function focusDraftCard(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest('button')) return
  ;(event.currentTarget as HTMLElement | null)?.focus()
}

function handleDraftKeydown(event: KeyboardEvent, draft: AttachmentDraft) {
  if (event.isComposing) return
  const cards = getDraftCards()
  const current = event.currentTarget as HTMLElement
  const index = cards.indexOf(current)

  if (event.key === 'ArrowLeft' && index > 0) {
    event.preventDefault()
    cards[index - 1]?.focus()
    return
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    if (index >= 0 && index < cards.length - 1) cards[index + 1]?.focus()
    else emit('focusInput')
    return
  }
  if ((event.key !== 'Backspace' && event.key !== 'Delete') || disabled) return

  event.preventDefault()
  const fallbackIndex = Math.max(0, index - 1)
  emit('remove', draft)
  nextTick(() => {
    const remainingCards = getDraftCards()
    if (remainingCards.length) {
      remainingCards[Math.min(fallbackIndex, remainingCards.length - 1)]?.focus()
    } else {
      emit('focusInput')
    }
  })
}

defineExpose({ focusLast })

// 格式化文件大小为可读字符串（B/KB/MB/GB）
function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function kindText(draft: AttachmentDraft) {
  if (draft.kind === 'image') return '图片'
  if (draft.kind === 'folder') return '文件夹'
  return '文件'
}

// 待上传状态的元信息：文件夹显示文件数+总大小，其余显示文件大小
function waitingMetaText(draft: AttachmentDraft) {
  if (draft.kind === 'folder') {
    return `${draft.folderFiles?.length ?? 0} 个文件 · ${formatFileSize(draft.size)}`
  }
  return formatFileSize(draft.size)
}

// 根据草稿状态返回对应的状态文本（校验/上传进度、已暂停、失败原因）
function statusText(draft: AttachmentDraft) {
  if (draft.status === 'hashing') return `校验 ${Math.round(draft.progress * 100)}%`
  if (draft.status === 'uploading') return `上传 ${Math.round(draft.progress * 100)}%`
  if (draft.status === 'paused') return '已暂停'
  if (draft.status === 'failed') return draft.error || '上传失败'
  return ''
}
</script>

<style scoped>
.attachment-draft-list {
  align-items: flex-start;
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  min-width: max-content;
  overflow: visible;
  padding: 12px 12px 4px;
}

.attachment-draft-item {
  box-sizing: border-box;
  flex: none;
  position: relative;
}

.attachment-draft-item:focus {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.attachment-draft-item:not(.is-image) {
  align-items: center;
  background: var(--bg-header);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(0, 1fr) 40px;
  height: 64px;
  padding: 9px 10px;
  width: 226px;
}

.attachment-draft-item.is-image {
  background: var(--bg-header);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
  width: max-content;
}

.attachment-draft-item.has-error {
  border-color: var(--danger-strong);
}

.attachment-draft-thumbnail {
  display: block;
  width: auto;
  height: auto;
  max-width: 200px;
  max-height: 64px;
  object-fit: contain;
}

.attachment-draft-image-placeholder {
  align-items: center;
  color: var(--text-tertiary);
  display: flex;
  font-size: var(--font-sm);
  min-height: 68px;
  min-width: 180px;
  justify-content: center;
}

.attachment-draft-icon {
  align-items: center;
  background: var(--accent-bg-light);
  border-radius: var(--radius-md);
  color: var(--accent);
  display: flex;
  height: 40px;
  justify-content: center;
  width: 40px;
}

.attachment-draft-icon svg {
  height: 26px;
  width: 26px;
}

.attachment-draft-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.attachment-draft-name {
  color: var(--text-primary);
  display: block;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-draft-meta {
  color: var(--text-tertiary);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-draft-meta.is-status {
  color: var(--accent);
}

.has-error .attachment-draft-meta.is-status {
  color: #a52f2a;
}

.attachment-draft-image-status {
  background: rgba(17, 24, 39, 0.72);
  border-radius: 999px;
  bottom: 6px;
  color: #fff;
  font-size: 10px;
  left: 7px;
  max-width: calc(100% - 14px);
  overflow: hidden;
  padding: 3px 7px;
  position: absolute;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.has-error .attachment-draft-image-status {
  background: rgba(165, 47, 42, 0.9);
}

.attachment-draft-controls {
  display: flex;
  gap: 4px;
  opacity: 0;
  pointer-events: none;
  position: absolute;
  right: 6px;
  top: 6px;
  transition: opacity 0.15s ease;
  z-index: 2;
}

.attachment-draft-item:hover .attachment-draft-controls,
.attachment-draft-item:focus-within .attachment-draft-controls,
.attachment-draft-controls.is-visible {
  opacity: 1;
  pointer-events: auto;
}

.attachment-draft-action {
  border: none;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.attachment-draft-action {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 999px;
  color: #4053bf;
  font-size: 11px;
  min-height: 22px;
  padding: 2px 7px;
}

.attachment-draft-action:hover:not(:disabled) {
  background: #fff;
  color: var(--accent-hover);
}

.attachment-draft-action:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.attachment-draft-action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

:global(.dark-theme) .attachment-draft-item {
  background: #303642;
  border-color: #4c5362;
}

:global(.dark-theme) .attachment-draft-item.has-error {
  border-color: #f08b84;
}

:global(.dark-theme) .attachment-draft-name {
  color: #edf0f5;
}

:global(.dark-theme) .attachment-draft-meta {
  color: #bdc4d1;
}

:global(.dark-theme) .attachment-draft-meta.is-status,
:global(.dark-theme) .attachment-draft-action {
  color: #aeb8ff;
}

:global(.dark-theme) .has-error .attachment-draft-meta.is-status {
  color: #ffaaa4;
}

:global(.dark-theme) .attachment-draft-icon {
  background: #41495c;
  color: #c4ccff;
}

:global(.dark-theme) .attachment-draft-action {
  background: rgba(48, 54, 66, 0.92);
}

@media (max-width: 760px) {
  .attachment-draft-item:not(.is-image) {
    max-width: 100%;
    width: 210px;
  }

}

@media (hover: none) {
  .attachment-draft-controls {
    opacity: 1;
    pointer-events: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .attachment-draft-controls,
  .attachment-draft-action {
    transition: none;
  }
}
</style>
