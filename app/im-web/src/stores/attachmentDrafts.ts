// Intent: attachmentDrafts keeps in-memory, conversation-scoped attachment files without persisting browser File objects.
import { defineStore } from 'pinia'
import { markRaw, ref } from 'vue'
import { DIRECT_UPLOAD_MAX_SIZE, FILE_UPLOAD_MAX_SIZE } from '../api/file'

export type AttachmentDraftKind = 'image' | 'file'
export type AttachmentDraftStatus = 'waiting' | 'hashing' | 'uploading' | 'paused' | 'failed'

export interface AttachmentDraft {
  id: string
  conversationId: string
  kind: AttachmentDraftKind
  file: File
  name: string
  size: number
  mimeType: string
  lastModified: number
  previewUrl?: string
  status: AttachmentDraftStatus
  progress: number
  error?: string
  controller?: AbortController
}

export interface AddAttachmentResult {
  added: AttachmentDraft[]
  duplicateCount: number
  errors: string[]
}

function createDraftId() {
  return globalThis.crypto?.randomUUID?.()
    || `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isImageFile(file: File) {
  return file.type.startsWith('image/')
}

function fingerprint(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function formatLimit(bytes: number) {
  if (bytes >= 1024 ** 3) return `${Math.round(bytes / 1024 ** 3)}GB`
  return `${Math.round(bytes / 1024 ** 2)}MB`
}

export const useAttachmentDraftStore = defineStore('attachmentDrafts', () => {
  const draftsByConversation = ref<Record<string, AttachmentDraft[]>>({})

  function draftsFor(conversationId?: string | null) {
    if (!conversationId) return []
    return draftsByConversation.value[conversationId] || []
  }

  function addFiles(conversationId: string, files: File[]): AddAttachmentResult {
    const current = draftsFor(conversationId)
    const fingerprints = new Set(current.map((draft) => fingerprint(draft.file)))
    const added: AttachmentDraft[] = []
    const errors: string[] = []
    let duplicateCount = 0

    for (const file of files) {
      const name = file.name || 'file'
      const kind: AttachmentDraftKind = isImageFile(file) ? 'image' : 'file'
      const maxSize = kind === 'image' ? DIRECT_UPLOAD_MAX_SIZE : FILE_UPLOAD_MAX_SIZE
      if (file.size <= 0) {
        errors.push(`${name}：文件为空`)
        continue
      }
      if (file.size > maxSize) {
        errors.push(`${name}：不能超过 ${formatLimit(maxSize)}`)
        continue
      }
      const fileFingerprint = fingerprint(file)
      if (fingerprints.has(fileFingerprint)) {
        duplicateCount += 1
        continue
      }
      fingerprints.add(fileFingerprint)
      const draft: AttachmentDraft = {
        id: createDraftId(),
        conversationId,
        kind,
        file: markRaw(file),
        name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        lastModified: file.lastModified,
        previewUrl: kind === 'image' ? URL.createObjectURL(file) : undefined,
        status: 'waiting',
        progress: 0,
      }
      added.push(draft)
    }

    if (added.length) {
      draftsByConversation.value[conversationId] = [...current, ...added]
    }
    return { added, duplicateCount, errors }
  }

  function updateDraft(
    conversationId: string,
    draftId: string,
    changes: Partial<Pick<AttachmentDraft, 'status' | 'progress' | 'error' | 'controller'>>,
  ) {
    const draft = draftsFor(conversationId).find((item) => item.id === draftId)
    if (!draft) return
    if ('controller' in changes && changes.controller) {
      changes.controller = markRaw(changes.controller)
    }
    Object.assign(draft, changes)
  }

  function releaseDraft(draft: AttachmentDraft) {
    draft.controller?.abort()
    if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl)
  }

  function removeDraft(conversationId: string, draftId: string) {
    const drafts = draftsFor(conversationId)
    const draft = drafts.find((item) => item.id === draftId)
    if (!draft) return null
    releaseDraft(draft)
    const remaining = drafts.filter((item) => item.id !== draftId)
    if (remaining.length) draftsByConversation.value[conversationId] = remaining
    else delete draftsByConversation.value[conversationId]
    return draft
  }

  function clearConversation(conversationId: string) {
    draftsFor(conversationId).forEach(releaseDraft)
    delete draftsByConversation.value[conversationId]
  }

  function clearAll() {
    Object.values(draftsByConversation.value).flat().forEach(releaseDraft)
    draftsByConversation.value = {}
  }

  return {
    draftsByConversation,
    draftsFor,
    addFiles,
    updateDraft,
    removeDraft,
    clearConversation,
    clearAll,
  }
})
