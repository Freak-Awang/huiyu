/**
 * 附件草稿 Store：按会话管理待发送的附件文件（图片/文件），
 * 维护上传状态、进度与中断控制器，不持久化浏览器 File 对象。
 */
import { defineStore } from 'pinia'
import { markRaw, ref } from 'vue'
import { DIRECT_UPLOAD_MAX_SIZE, FILE_UPLOAD_MAX_SIZE } from '../api/file'

/** 附件类型：图片或普通文件 */
export type AttachmentDraftKind = 'image' | 'file'
/** 附件分类方式：由入口明确指定，或根据文件元数据自动识别 */
export type AttachmentDraftClassification = AttachmentDraftKind | 'auto'
/** 附件上传状态 */
export type AttachmentDraftStatus = 'waiting' | 'hashing' | 'uploading' | 'paused' | 'failed'

/**
 * 附件草稿：表示一个待发送的附件文件及其上传状态。
 */
export interface AttachmentDraft {
  /** 草稿唯一标识 */
  id: string
  /** 所属会话 ID */
  conversationId: string
  /** 附件类型 */
  kind: AttachmentDraftKind
  /** 浏览器 File 对象（使用 markRaw 避免响应式包装） */
  file: File
  /** 文件名 */
  name: string
  /** 文件大小（字节） */
  size: number
  /** 文件 MIME 类型 */
  mimeType: string
  /** 文件最后修改时间戳 */
  lastModified: number
  /** 图片预览 URL（仅图片类型生成） */
  previewUrl?: string
  /** 上传状态 */
  status: AttachmentDraftStatus
  /** 上传进度（0~1） */
  progress: number
  /** 错误信息 */
  error?: string
  /** 上传中断控制器 */
  controller?: AbortController
}

/**
 * 添加附件操作结果。
 */
export interface AddAttachmentResult {
  /** 成功添加的附件列表 */
  added: AttachmentDraft[]
  /** 重复文件数量 */
  duplicateCount: number
  /** 错误信息列表 */
  errors: string[]
}

function createDraftId() {
  return globalThis.crypto?.randomUUID?.()
    || `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

const GENERIC_MIME_TYPES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
])

const SUPPORTED_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

function normalizedMimeType(file: File) {
  return (file.type || '').split(';', 1)[0].trim().toLowerCase()
}

function hasSupportedImageExtension(file: File) {
  const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : undefined
  return !!extension && SUPPORTED_IMAGE_EXTENSIONS.has(extension)
}

function resolveDraftKind(file: File, classification: AttachmentDraftClassification): AttachmentDraftKind {
  if (classification !== 'auto') return classification

  const mimeType = normalizedMimeType(file)
  if (SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) return 'image'
  if (GENERIC_MIME_TYPES.has(mimeType) && hasSupportedImageExtension(file)) return 'image'
  return 'file'
}

function fingerprint(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function formatLimit(bytes: number) {
  if (bytes >= 1024 ** 3) return `${Math.round(bytes / 1024 ** 3)}GB`
  return `${Math.round(bytes / 1024 ** 2)}MB`
}

/**
 * 附件草稿 Store：按会话维度管理待发送附件。
 * state: draftsByConversation - 会话 ID 到附件草稿数组的映射
 */
export const useAttachmentDraftStore = defineStore('attachmentDrafts', () => {
  /** 按会话 ID 分组的附件草稿映射 */
  const draftsByConversation = ref<Record<string, AttachmentDraft[]>>({})

  /**
   * 获取指定会话的附件草稿列表。
   * @param conversationId 会话 ID
   * @returns 该会话的附件草稿数组
   */
  function draftsFor(conversationId?: string | null) {
    if (!conversationId) return []
    return draftsByConversation.value[conversationId] || []
  }

  /**
   * 向指定会话添加附件文件。
   * 自动过滤空文件、超大文件及重复文件，图片文件生成预览 URL。
   * @param conversationId 会话 ID
   * @param files 待添加的文件数组
   * @param classification 分类方式；图片/文件入口应明确传值，拖拽等场景使用 auto
   * @returns 添加结果（成功列表、重复数、错误列表）
   */
  function addFiles(
    conversationId: string,
    files: File[],
    classification: AttachmentDraftClassification = 'auto',
  ): AddAttachmentResult {
    const current = draftsFor(conversationId)
    const fingerprints = new Set(current.map((draft) => fingerprint(draft.file)))
    const added: AttachmentDraft[] = []
    const errors: string[] = []
    let duplicateCount = 0

    for (const file of files) {
      const name = file.name || 'file'
      const kind = resolveDraftKind(file, classification)
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

  /**
   * 更新指定附件草稿的状态、进度、错误或中断控制器。
   * @param conversationId 会话 ID
   * @param draftId 草稿 ID
   * @param changes 待更新的字段
   */
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

  /** 释放附件草稿资源：中断上传并回收预览 URL */
  function releaseDraft(draft: AttachmentDraft) {
    draft.controller?.abort()
    if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl)
  }

  /**
   * 移除指定附件草稿并释放其资源。
   * @param conversationId 会话 ID
   * @param draftId 草稿 ID
   * @returns 被移除的草稿对象，未找到返回 null
   */
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

  /**
   * 清空指定会话的所有附件草稿并释放资源。
   * @param conversationId 会话 ID
   */
  function clearConversation(conversationId: string) {
    draftsFor(conversationId).forEach(releaseDraft)
    delete draftsByConversation.value[conversationId]
  }

  /** 清空所有会话的附件草稿并释放资源 */
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
