<template>
  <section v-if="open" class="transfer-center" role="dialog" aria-modal="false" aria-label="文件传输中心" @keydown.esc="$emit('close')">
    <header><div><h2>文件传输</h2><p>文件直接在双方桌面端之间传输</p></div><button type="button" aria-label="关闭传输中心" @click="$emit('close')">关闭</button></header>
    <nav aria-label="传输筛选"><button v-for="filter in filters" :key="filter.value" type="button" :class="{ selected: selected === filter.value }" @click="selected = filter.value">{{ filter.label }}</button></nav>
    <div ref="listElement" class="transfer-list">
      <p v-if="!visibleItems.length" class="transfer-empty">{{ selected === 'all' ? '暂无文件传输任务' : '没有符合条件的任务' }}</p>
      <article v-for="item in visibleItems" :key="item.taskId || item.transferId" class="transfer-item">
        <div class="transfer-heading"><strong :title="item.name">{{ item.name || '文件' }}</strong><span>{{ item.direction === 'send' ? '发送' : '接收' }}</span></div>
        <button v-if="item.conversationId" type="button" class="transfer-conversation" @click="$emit('conversation', item.conversationId)">{{ item.conversationName || '查看所属会话' }}</button>
        <p class="transfer-status" :class="{ error: item.status === 'failed' || item.status === 'unavailable' }">{{ transferStatusLabel(item) }}</p>
        <progress v-if="transferProgressValue(item) !== undefined" :value="transferProgressValue(item)" max="1" :aria-label="`${item.name} ${transferStatusLabel(item)}进度`" />
        <p class="transfer-detail">{{ transferProgressText(item) }}</p>
        <p v-if="item.currentFile" class="transfer-detail" :title="item.currentFile">当前文件：{{ item.currentFile }}</p>
        <p v-if="item.error && (!item.cleanupPending || item.error !== item.cleanupError)" class="transfer-error" role="status">{{ item.error }}</p>
        <p v-if="item.cleanupPending" class="transfer-error" role="status">{{ item.cleanupError || '临时文件尚未清理，请确认磁盘可用后重试。' }}</p>
        <div class="transfer-actions"><button v-for="action in transferActions(item)" :key="action.value" type="button" :disabled="busyIds.includes(item.taskId || item.transferId)" @click="$emit('action', action.value, item)">{{ action.label }}</button></div>
      </article>
    </div>
    <footer v-if="totalItems > 0" class="transfer-pagination" aria-label="传输任务分页">
      <button type="button" :disabled="page <= 1" @click="page--">上一页</button>
      <span aria-live="polite">第 {{ page }} / {{ pageCount }} 页 · 共 {{ totalItems }} 条</span>
      <button type="button" :disabled="page >= pageCount" @click="page++">下一页</button>
    </footer>
  </section>
</template>

<script lang="ts">
import { computed, ref, watch } from 'vue'

export interface TransferCenterItem {
  taskId?: string
  transferId: string
  conversationId?: string
  conversationName?: string
  name?: string
  kind?: string
  direction: 'send' | 'receive'
  status: string
  phase?: string
  progress?: number
  transferredBytes?: number
  totalBytes?: number
  phaseProcessedBytes?: number
  phaseTotalBytes?: number
  error?: string
  cleanupPending?: boolean
  cleanupError?: string
  speedBytesPerSecond?: number
  etaSeconds?: number
  currentFile?: string
  completedFiles?: number
  fileCount?: number
  directoryCount?: number
  pauseReason?: string
  desiredState?: string
  shareState?: string
  draft?: boolean
}
export type TransferAction = 'pause' | 'resume' | 'cancel' | 'stopSharing' | 'locateSource' | 'open' | 'reveal' | 'locateResult' | 'receiveAgain' | 'changeDestination' | 'retryCleanup'
export function transferStatusLabel(item: TransferCenterItem): string {
  const label = transferBaseStatusLabel(item)
  return item.cleanupPending ? `${label} · 临时文件待清理` : label
}
function transferBaseStatusLabel(item: TransferCenterItem): string {
  if (item.status === 'completed' && item.direction === 'send' && ['STOPPED', 'RECALLED'].includes(item.shareState || '')) return '发送完成 · 已停止分享'
  if (item.status === 'paused' && item.pauseReason === 'network') return item.desiredState === 'running' ? '连接中断，等待重连' : '连接中断，等待手动继续'
  if (item.status === 'paused' && item.pauseReason === 'peer') return '对方已暂停'
  const labels: Record<string, string> = {
    scanning: '正在扫描目录', preparing: '正在准备', hashing: '正在校验源文件',
    waiting: item.direction === 'send' ? '等待对方接收' : '等待接收', queued: '排队中',
    connecting: '正在连接对方', sending: '正在发送', receiving: '正在接收',
    verifying: '正在校验接收文件', committing: '正在保存',
    completed: item.direction === 'send' ? '发送完成 · 仍在分享' : '接收完成',
    failed: '传输失败', cancelled: '已取消', claimed: '正在其他设备接收',
    unavailable: '文件暂不可用', stopped: '已停止分享', recalled: '消息已撤回',
    paused: item.pauseReason === 'restart' || item.pauseReason === 'restored' ? '已恢复任务，等待手动继续' : '已暂停',
  }
  if (['sending', 'receiving'].includes(item.status) && item.phase && labels[item.phase]) return labels[item.phase]
  return labels[item.status] || labels[item.phase || ''] || '等待处理'
}
function formatBytes(size: number) {
  if (size < 1024) return `${Math.max(0, size)} B`
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`
  return `${(size / 1024 ** 3).toFixed(1)} GB`
}
function activeTransferPhase(item: TransferCenterItem) {
  if (['verifying', 'committing'].includes(item.status)) return item.status
  if (['sending', 'receiving'].includes(item.status) && ['verifying', 'committing'].includes(item.phase || '')) return item.phase
  return undefined
}
export function transferProgressValue(item: TransferCenterItem): number | undefined {
  if (!(item.totalBytes! > 0) || item.cleanupPending || ['waiting', 'completed', 'cancelled', 'stopped', 'recalled', 'claimed'].includes(item.status)) return undefined
  if (activeTransferPhase(item)) {
    if (!(item.phaseTotalBytes! > 0) || !Number.isFinite(item.phaseProcessedBytes)) return undefined
    return Math.max(0, Math.min(1, item.phaseProcessedBytes! / item.phaseTotalBytes!))
  }
  return Math.max(0, Math.min(1, Number.isFinite(item.progress) ? item.progress! : (item.transferredBytes || 0) / item.totalBytes!))
}
export function transferProgressText(item: TransferCenterItem) {
  if (item.totalBytes === 0) {
    if (item.kind !== 'folder') return '空文件'
    const entries = ['完整目录结构（含空目录）']
    if (item.directoryCount !== undefined) entries.push(`${item.directoryCount} 个子目录`)
    if ((item.fileCount || 0) > 0) entries.push(`${item.fileCount} 个空文件`)
    return entries.join(' · ')
  }
  const phase = activeTransferPhase(item)
  const phaseLabel = phase === 'verifying' ? '校验' : '保存'
  const parts = [phase
    ? Number.isFinite(item.phaseProcessedBytes) && Number.isFinite(item.phaseTotalBytes)
      ? `${phaseLabel} ${formatBytes(item.phaseProcessedBytes!)} / ${formatBytes(item.phaseTotalBytes!)}`
      : `${phaseLabel}中`
    : `${formatBytes(item.transferredBytes || 0)} / ${formatBytes(item.totalBytes || 0)}`]
  if (item.kind === 'folder') parts.push(phase ? `共 ${item.fileCount || 0} 个文件` : `${item.completedFiles || 0} / ${item.fileCount || 0} 个文件`)
  if (!phase && (item.speedBytesPerSecond || 0) > 0 && ['sending', 'receiving'].includes(item.status)) {
    parts.push(`${formatBytes(item.speedBytesPerSecond!)}/s`)
    if (Number.isFinite(item.etaSeconds) && item.etaSeconds! >= 0) parts.push(`约剩 ${Math.max(1, Math.ceil(item.etaSeconds! / 60))} 分钟`)
  }
  return parts.join(' · ')
}
export function transferActions(item: TransferCenterItem): Array<{ value: TransferAction; label: string }> {
  const actions: Array<{ value: TransferAction; label: string }> = []
  if (item.cleanupPending && !item.draft) return [{ value: 'retryCleanup', label: '重试清理' }]
  const shareEnded = ['STOPPED', 'RECALLED'].includes(item.shareState || '')
  if (shareEnded && item.status !== 'completed') return actions
  const source = !item.draft && item.direction === 'send'
  const idleSource = source && ['waiting', 'completed'].includes(item.status)
  if (!shareEnded && (idleSource || ['queued', 'preparing', 'hashing', 'connecting', 'sending', 'receiving', 'verifying', 'committing'].includes(item.status))) actions.push({ value: 'pause', label: idleSource ? '暂停分享' : '暂停' })
  if (['paused', 'failed', 'unavailable'].includes(item.status)) actions.push({ value: 'resume', label: item.status === 'paused' ? '继续' : '重试' })
  if (item.status === 'waiting' && item.direction === 'receive') actions.push({ value: 'resume', label: '接收' })
  const canCancelSource = !source || ['queued', 'connecting', 'sending', 'verifying', 'committing'].includes(item.status)
  if (canCancelSource && !['completed', 'cancelled', 'stopped', 'recalled', 'claimed'].includes(item.status)) actions.push({ value: 'cancel', label: '取消' })
  if (!item.draft && item.direction === 'send' && !shareEnded && !['stopped', 'recalled', 'cancelled'].includes(item.status)) {
    actions.push({ value: 'stopSharing', label: '停止分享' })
    if (['failed', 'unavailable', 'paused'].includes(item.status)) actions.push({ value: 'locateSource', label: '重新定位源文件' })
  }
  if (!item.draft && item.direction === 'receive') {
    if (item.status === 'completed') actions.push({ value: 'open', label: '打开' }, { value: 'reveal', label: '位置' }, { value: 'locateResult', label: '重新定位' })
    if (!shareEnded && ['completed', 'cancelled'].includes(item.status)) actions.push({ value: 'receiveAgain', label: '重新接收' })
    if (['failed', 'paused', 'unavailable'].includes(item.status)) actions.push({ value: 'changeDestination', label: '更改保存位置' })
  }
  return actions
}
export function primaryTransferAction(item: TransferCenterItem) {
  const actions = transferActions(item)
  return actions.find((action) => ['open', 'pause', 'resume', 'receiveAgain'].includes(action.value))
}
export function useTransferPagination(items: () => TransferCenterItem[]) {
  const selected = ref('all')
  const page = ref(1)
  const filtered = computed(() => items().filter((item) => {
    if (selected.value === 'active') return ['queued', 'preparing', 'hashing', 'waiting', 'connecting', 'sending', 'receiving', 'verifying', 'committing'].includes(item.status)
    if (selected.value === 'attention') return item.cleanupPending || ['paused', 'failed', 'unavailable'].includes(item.status)
    if (selected.value === 'completed') return item.status === 'completed'
    return true
  }))
  const totalItems = computed(() => filtered.value.length)
  const pageCount = computed(() => Math.max(1, Math.ceil(totalItems.value / 50)))
  watch(selected, () => { page.value = 1 }, { flush: 'sync' })
  watch(pageCount, (count) => { page.value = Math.max(1, Math.min(page.value, count)) }, { flush: 'sync' })
  const visibleItems = computed(() => filtered.value.slice((page.value - 1) * 50, page.value * 50))
  return { selected, page, pageCount, totalItems, visibleItems }
}
</script>

<script setup lang="ts">
const props = defineProps<{ open: boolean; items: TransferCenterItem[]; busyIds: string[] }>()
defineEmits<{ close: []; action: [action: TransferAction, item: TransferCenterItem]; conversation: [conversationId: string] }>()
const { selected, page, pageCount, totalItems, visibleItems } = useTransferPagination(() => props.items)
const listElement = ref<HTMLElement | null>(null)
watch([page, selected], () => listElement.value?.scrollTo({ top: 0 }), { flush: 'post' })
const filters = [{ value: 'all', label: '全部' }, { value: 'active', label: '进行中' }, { value: 'attention', label: '需处理' }, { value: 'completed', label: '已完成' }]
</script>

<style scoped>
.transfer-center { position: fixed; z-index: 120; right: 24px; top: 56px; bottom: 24px; width: min(520px, calc(100vw - 48px)); display: flex; flex-direction: column; background: var(--bg-header, #fff); color: var(--text-primary, #222); border: 1px solid var(--border-light, #ddd); border-radius: 16px; box-shadow: 0 16px 60px #0003; padding: 20px; }
header,.transfer-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; } h2 { margin: 0; font-size: 20px; } header p { margin: 6px 0 0; font-size: 12px; color: var(--text-tertiary, #777); }
button { cursor: pointer; border: 1px solid var(--border-light, #ddd); border-radius: 7px; padding: 6px 10px; background: transparent; color: inherit; } button:disabled { opacity: .5; cursor: default; } button:focus-visible { outline: 2px solid var(--accent, #5566d9); }
nav { display: flex; gap: 8px; margin: 20px 0 12px; } nav .selected { background: var(--accent, #5566d9); color: white; }
.transfer-list { overflow-y: auto; min-height: 0; } .transfer-item { border-top: 1px solid var(--border-light, #ddd); padding: 16px 0; } .transfer-heading strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .transfer-heading span { flex-shrink: 0; font-size: 12px; }
.transfer-pagination { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-shrink: 0; margin-top: auto; padding-top: 12px; border-top: 1px solid var(--border-light, #ddd); font-size: 12px; }
.transfer-conversation { margin-top: 6px; font-size: 12px; border: 0; padding-left: 0; color: var(--accent, #5566d9); } .transfer-status { margin: 8px 0; font-size: 13px; } .transfer-detail { font-size: 12px; color: var(--text-tertiary, #777); overflow-wrap: anywhere; } .transfer-error,.error { color: var(--danger-strong, #c33); font-size: 12px; overflow-wrap: anywhere; } progress { width: 100%; accent-color: var(--accent, #5566d9); height: 6px; } .transfer-actions { display: flex; gap: 6px; flex-wrap: wrap; font-size: 12px; } .transfer-empty { margin-top: 40px; text-align: center; color: var(--text-tertiary, #777); }
</style>
