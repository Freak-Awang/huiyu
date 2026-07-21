<template>
  <div v-if="drafts.length" class="attachment-draft-list" aria-label="待发送附件">
    <article
      v-for="draft in drafts"
      :key="draft.id"
      class="attachment-draft-item"
      :class="{ 'is-image': draft.kind === 'image', 'has-error': draft.status === 'failed' }"
      :title="`${draft.name} (${formatFileSize(draft.size)})`"
    >
      <img
        v-if="draft.kind === 'image' && draft.previewUrl"
        class="attachment-draft-thumbnail"
        :src="draft.previewUrl"
        :alt="draft.name"
      />
      <span v-else class="attachment-draft-icon" aria-hidden="true">
        <img :src="fileIcon" alt="" />
      </span>
      <span class="attachment-draft-name">{{ draft.name }}</span>
      <span class="attachment-draft-size">{{ formatFileSize(draft.size) }}</span>
      <span v-if="draft.status !== 'waiting'" class="attachment-draft-status">
        {{ statusText(draft) }}
      </span>
      <button
        v-if="draft.kind === 'file' && (draft.status === 'hashing' || draft.status === 'uploading')"
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
      <button
        type="button"
        class="attachment-draft-remove"
        :disabled="disabled"
        :aria-label="`移除附件 ${draft.name}`"
        @click="$emit('remove', draft)"
      >×</button>
    </article>
  </div>
</template>

<script setup lang="ts">
import type { AttachmentDraft } from '../stores/attachmentDrafts'

defineProps<{
  drafts: AttachmentDraft[]
  disabled: boolean
  fileIcon: string
}>()

defineEmits<{
  remove: [draft: AttachmentDraft]
  pause: [draft: AttachmentDraft]
  retry: [draft: AttachmentDraft]
}>()

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`
}

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
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 164px;
  overflow-y: auto;
  padding: 4px 0 8px;
}

.attachment-draft-item {
  align-items: center;
  background: #fff;
  border: 1px solid #d8dce8;
  border-radius: 8px;
  display: grid;
  gap: 8px;
  grid-template-columns: 40px minmax(0, 1fr) auto minmax(58px, auto) auto 24px;
  min-height: 48px;
  padding: 6px 8px;
}

.attachment-draft-item.has-error {
  border-color: #c2413b;
}

.attachment-draft-thumbnail,
.attachment-draft-icon {
  border-radius: 6px;
  height: 36px;
  width: 36px;
}

.attachment-draft-thumbnail {
  object-fit: cover;
}

.attachment-draft-icon {
  align-items: center;
  background: #eef0ff;
  display: flex;
  justify-content: center;
}

.attachment-draft-icon img {
  height: 20px;
  width: 20px;
}

.attachment-draft-name {
  color: #333;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-draft-size {
  color: #606775;
  font-size: 11px;
  white-space: nowrap;
}

.attachment-draft-status {
  color: #4053bf;
  font-size: 11px;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.has-error .attachment-draft-status {
  color: #a52f2a;
}

.attachment-draft-action,
.attachment-draft-remove {
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}

.attachment-draft-action {
  background: transparent;
  border: none;
  color: #4053bf;
  font-size: 11px;
  padding: 4px;
}

.attachment-draft-action:hover:not(:disabled) {
  color: #263ca8;
  text-decoration: underline;
}

.attachment-draft-remove {
  background: rgba(0, 0, 0, 0.62);
  border: none;
  border-radius: 50%;
  color: #fff;
  font-size: 15px;
  grid-column: -1;
  height: 20px;
  line-height: 20px;
  padding: 0;
  width: 20px;
}

.attachment-draft-remove:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.8);
}

.attachment-draft-action:focus-visible,
.attachment-draft-remove:focus-visible {
  outline: 2px solid #4053bf;
  outline-offset: 2px;
}

.attachment-draft-action:disabled,
.attachment-draft-remove:disabled {
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

:global(.dark-theme) .attachment-draft-size {
  color: #bdc4d1;
}

:global(.dark-theme) .attachment-draft-status,
:global(.dark-theme) .attachment-draft-action {
  color: #aeb8ff;
}

:global(.dark-theme) .has-error .attachment-draft-status {
  color: #ffaaa4;
}

@media (max-width: 760px) {
  .attachment-draft-item {
    grid-template-columns: 40px minmax(0, 1fr) auto 24px;
  }

  .attachment-draft-status {
    grid-column: 2 / -1;
    grid-row: 2;
    max-width: none;
  }
}
</style>
