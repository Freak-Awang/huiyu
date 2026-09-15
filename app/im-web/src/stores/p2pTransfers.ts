import { defineStore } from 'pinia'
import { computed, markRaw, ref } from 'vue'
import type { AttachmentDraft } from './attachmentDrafts'
import type { WebSocketManager, WsMessage } from '../utils/websocket'
import {
  P2P_ACK_WINDOW,
  P2P_BUFFER_HIGH_WATER,
  P2P_BUFFER_LOW_WATER,
  P2P_CHUNK_SIZE,
  P2P_MAX_MANIFEST_TEXT,
  decodeP2pDataFrame,
  encodeP2pDataFrame,
  normalizeP2pRelativePath,
  p2pOfferSummary,
  prepareP2pFile,
  prepareP2pFolder,
  splitP2pManifest,
  verifyP2pManifest,
  validateP2pManifestStructure,
  parseP2pAttachmentContent,
  type P2pAttachmentContent,
  type P2pManifest,
  type PreparedP2pSource,
} from '../utils/p2pProtocol'

export type P2pTransferStatus =
  | 'preparing' | 'waiting' | 'connecting' | 'queued'
  | 'sending' | 'receiving' | 'paused' | 'completed'
  | 'failed' | 'cancelled' | 'claimed' | 'unavailable' | 'verifying' | 'committing' | 'stopped' | 'recalled'

export interface P2pTransferState {
  taskId?: string
  conversationId?: string
  messageId?: string
  name?: string
  kind?: 'file' | 'folder'
  fileCount?: number
  directoryCount?: number
  completedFiles?: number
  currentFile?: string
  phase?: P2pTransferStatus
  phaseProcessedBytes?: number
  phaseTotalBytes?: number
  desiredState?: 'running' | 'paused'
  pauseReason?: 'manual' | 'restart' | 'network' | 'peer' | 'error'
  speedBytesPerSecond?: number
  etaSeconds?: number
  shareState?: string
  content?: P2pAttachmentContent
  sourceId?: string
  pendingControls?: Array<{ cmd: string; data: Record<string, unknown> }>
  transferId: string
  direction: 'send' | 'receive'
  status: P2pTransferStatus
  progress: number
  transferredBytes: number
  totalBytes: number
  error?: string
  cleanupPending?: boolean
  cleanupError?: string
  routeId?: string
  receiveId?: string
  localPath?: string
}

interface SourceRecord {
  transferId: string
  messageId: string
  conversationId: string
  source: PreparedP2pSource
  registrationId?: string
}

interface IncomingRecord {
  content: P2pAttachmentContent
  receiveId: string
  finalPath: string
  manifest?: P2pManifest
}

interface PendingOffer {
  conversationId: string
  clientMsgId: string
  source: PreparedP2pSource
}

interface PeerRuntime {
  transferId: string
  routeId: string
  role: 'source' | 'receiver'
  pc: RTCPeerConnection
  channel?: RTCDataChannel
  pendingCandidates: RTCIceCandidateInit[]
  receiveChain: Promise<void>
  ackOffsets: Map<number, number>
  fileResults: Map<number, 'ok' | 'failed'>
  sending: boolean
  closed: boolean
  lastAckSent: Map<number, number>
  manifestParts: string[]
  manifestExpectedChunks: number
  manifestLength: number
  startedAt: number
  lastProgressAt: number
  lastPeerAt: number
  lastPingAt: number
  lastProgressReportAt: number
  processingPhase?: string
  processingBytes?: number
  processingSequence?: number
}

interface OfferResponse {
  transferId: string
  messageId: string | number
  conversationId: string | number
  messageType: 'FILE' | 'FOLDER'
  content: string
  clientMsgId: string
  status: string
  createdAt?: string
}

const manifestPrefixOffsets = new WeakMap<P2pManifest, number[]>()
const RETRY_DELAYS = [1000, 3000, 10000]
const TERMINAL = new Set<P2pTransferStatus>(['completed', 'cancelled', 'stopped', 'recalled'])

function wait(ms: number) {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms))
}

function isDesktopP2pAvailable() {
  const desktop = window.imDesktop
  return !!(desktop?.startP2pReceive && desktop.prepareP2pReceive && desktop.writeP2pChunk
    && desktop.finishP2pFile && desktop.commitP2pReceive && desktop.abortP2pReceive)
}

function totalBefore(manifest: P2pManifest, fileIndex: number) {
  let offsets = manifestPrefixOffsets.get(manifest)
  if (!offsets) {
    offsets = new Array(manifest.files.length + 1).fill(0)
    for (let index = 0; index < manifest.files.length; index += 1) {
      offsets[index + 1] = offsets[index] + manifest.files[index].size
    }
    manifestPrefixOffsets.set(manifest, offsets)
  }
  return offsets[fileIndex] || 0
}

export const useP2pTransferStore = defineStore('p2pTransfers', () => {
  const states = ref<Record<string, P2pTransferState>>({})
  const peerAvailability = ref<Record<string, boolean>>({})
  const serverEnabled = ref(false)
  const localReady = ref(!window.imDesktop?.setP2pAccount)
  const desktopSupported = computed(() => localReady.value && isDesktopP2pAvailable())
  const history = ref<P2pTransferState[]>([])
  const restoredDrafts = ref<Array<{ taskId: string; draftId?: string; sourceId?: string; conversationId: string; name: string; kind: 'file' | 'folder'; totalSize: number; fileCount: number; directoryCount: number }>>([])
  const tasks = computed(() => {
    const latest = new Map(history.value.map((task) => [task.taskId || task.transferId, task]))
    for (const task of Object.values(states.value)) latest.set(task.taskId || task.transferId, task)
    return [...latest.values()].reverse()
  })
  let accountId = ''
  let accountEpoch = 0
  let watchdog: ReturnType<typeof setInterval> | undefined
  let registration: Promise<void> | undefined
  let disposal: Promise<void> | undefined
  const disposalBarriers: Promise<unknown>[] = []
  let removeNativeProgress: (() => void) | undefined
  const retryCounts = new Map<string, number>()
  const connectionDeadlines = new Map<string, number>()
  const requestEpochs = new Map<string, number>()
  const speedSamples = new Map<string, { time: number; bytes: number }>()
  const persistQueue = new Map<string, Promise<unknown>>()
  const flushing = new Map<string, Promise<void>>()
  const retiredRoutes = new Set<string>()

  let socket: WebSocketManager | null = null
  let removeSubscriptions: Array<() => void> = []
  const sources = new Map<string, SourceRecord>()
  const incoming = new Map<string, IncomingRecord>()
  const pendingOffers = new Map<string, PendingOffer>()
  const runtimes = new Map<string, PeerRuntime>()
  const outboundQueue: Array<{ transferId: string; routeId: string }> = []
  const activeOutboundByConversation = new Map<string, string>()
  const resumeTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const receiveSuspensions = new Map<string, Promise<unknown>>()

  function suspendReceive(transferId: string, reason: string): Promise<unknown> {
    const receive = incoming.get(transferId)
    if (!receive || !window.imDesktop?.suspendP2pReceive) return Promise.resolve()
    const previous = receiveSuspensions.get(receive.receiveId)
    if (previous) return previous
    const pending = window.imDesktop.suspendP2pReceive(receive.receiveId, reason)
      .finally(() => { if (receiveSuspensions.get(receive.receiveId) === pending) receiveSuspensions.delete(receive.receiveId) })
    receiveSuspensions.set(receive.receiveId, pending)
    return pending
  }

  function setState(transferId: string, changes: Partial<P2pTransferState>) {
    const current = states.value[transferId] || {
      transferId,
      direction: sources.has(transferId) ? 'send' : 'receive',
      status: 'waiting',
      progress: 0,
      transferredBytes: 0,
      totalBytes: 0,
      desiredState: 'running' as const,
    }
    const next = { ...current, ...changes, phase: changes.status || current.status }
    if (changes.transferredBytes != null) {
      const now = Date.now()
      const sample = speedSamples.get(transferId)
      if (sample && now - sample.time >= 500 && changes.transferredBytes >= sample.bytes) {
        next.speedBytesPerSecond = (changes.transferredBytes - sample.bytes) * 1000 / (now - sample.time)
        next.etaSeconds = next.speedBytesPerSecond > 0 ? Math.ceil((next.totalBytes - next.transferredBytes) / next.speedBytesPerSecond) : undefined
        speedSamples.set(transferId, { time: now, bytes: changes.transferredBytes })
      } else if (!sample || changes.transferredBytes < sample.bytes) speedSamples.set(transferId, { time: now, bytes: changes.transferredBytes })
    }
    if (next.status !== 'sending' && next.status !== 'receiving') next.speedBytesPerSecond = 0
    states.value = { ...states.value, [transferId]: next }
    if ((changes.status && changes.status !== current.status) || changes.desiredState !== undefined
      || changes.pendingControls || changes.shareState || changes.taskId) void persistState(transferId)
  }

  function stateFor(transferId: string) {
    return states.value[transferId]
  }

  function resolveId(id: string) {
    return states.value[id] ? id : tasks.value.find((task) => task.taskId === id)?.transferId || id
  }

  function resolveCurrentId(id: string) {
    const transferId = resolveId(id)
    if (id !== transferId && states.value[transferId]?.taskId !== id) throw new Error('这是历史记录，请在当前传输任务中操作')
    return transferId
  }

  function updateTaskRecord(id: string, changes: Partial<P2pTransferState>) {
    const transferId = resolveId(id)
    if (id === transferId || states.value[transferId]?.taskId === id) setState(transferId, changes)
    else history.value = history.value.map((task) => task.taskId === id ? { ...task, ...changes } : task)
  }

  async function persistState(transferId: string) {
    const state = states.value[transferId]
    if (!accountId || !state?.taskId || !window.imDesktop?.saveP2pTask) return
    const epoch = accountEpoch
    // IPC uses structured clone; nested Vue proxies must be reduced to the persisted JSON DTO.
    const payload = JSON.parse(JSON.stringify({ ...state, messageId: state.messageId || '', conversationId: state.conversationId || '',
      totalSize: state.totalBytes, name: state.name || '', kind: state.kind || 'file',
      sourceId: sources.get(transferId)?.source.sourceId || state.sourceId,
      manifest: sources.get(transferId)?.source.manifest || incoming.get(transferId)?.manifest }, (_key, value) => value === undefined ? null : value))
    const previous = persistQueue.get(state.taskId) || Promise.resolve()
    const pending = previous.catch(() => undefined).then(() => {
      if (epoch === accountEpoch) return window.imDesktop?.saveP2pTask?.(payload)
    }).catch((error) => {
      if (epoch === accountEpoch && states.value[transferId]) {
        states.value[transferId] = { ...states.value[transferId]!, error: `任务保存失败：${String(error)}` }
      }
    })
    persistQueue.set(state.taskId, pending)
    await pending
    if (persistQueue.get(state.taskId) === pending) persistQueue.delete(state.taskId)
  }

  async function restoreAccount(userId: string) {
    if (accountId === userId) return
    await dispose()
    localReady.value = false
    accountId = userId
    const epoch = ++accountEpoch
    const records = await window.imDesktop?.setP2pAccount?.(userId) || []
    if (epoch !== accountEpoch) return
    localReady.value = true
    const restored: Record<string, P2pTransferState> = {}
    restoredDrafts.value = records.filter((record) => record.transferId.startsWith('draft_')
      && !records.some((offer) => offer.taskId === `offer_${record.taskId.slice(6)}`))
    history.value = records.filter((record) => !record.transferId.startsWith('draft_')).map((record) => {
      const manifest = record.manifest as P2pManifest | undefined
      const content = record.content as P2pAttachmentContent | undefined || (manifest ? {
        transferMode: 'p2p_lan' as const, transferId: record.transferId,
        ...p2pOfferSummary({ manifest, files: [] }),
      } : undefined)
      const terminal = TERMINAL.has(record.status as P2pTransferStatus)
      const state: P2pTransferState = { ...record, content,
        status: terminal ? record.status as P2pTransferStatus : 'paused',
        phase: terminal ? record.status as P2pTransferStatus : 'paused',
        pauseReason: terminal ? undefined : 'restart', desiredState: record.status === 'completed' ? 'running' : 'paused',
        totalBytes: record.totalSize, transferredBytes: record.transferredBytes || 0,
        progress: record.status === 'completed' ? 1 : record.totalSize ? (record.transferredBytes || 0) / record.totalSize : 0,
        localPath: record.localPath, error: record.error || (terminal ? undefined : '已恢复进度，等待手动继续'),
      }
      restored[record.transferId] = state
      if (record.direction === 'send' && record.sourceId && manifest && !['stopped', 'recalled'].includes(record.status)) {
        sources.set(record.transferId, markRaw({ transferId: record.transferId, messageId: record.messageId,
          conversationId: record.conversationId, registrationId: record.sourceId,
          source: { sourceId: record.sourceId, manifest, files: manifest.files.map((entry) => ({ entry })) } }))
      } else if (record.direction === 'receive' && record.receiveId && content && !terminal) {
        incoming.set(record.transferId, { content, receiveId: record.receiveId, finalPath: record.localPath || '', manifest })
      }
      return state
    })
    states.value = restored
    removeNativeProgress = window.imDesktop?.onP2pReceiveProgress?.((event) => {
      const pair = [...incoming.entries()].find(([, record]) => record.receiveId === event.receiveId)
      if (!pair) return
      const runtime = runtimes.get(pair[0])
      if (!runtime || runtime.closed) return
      runtime.lastProgressAt = Date.now()
      setState(pair[0], { status: event.phase, phaseProcessedBytes: event.processedBytes, phaseTotalBytes: event.totalBytes })
      sendControl(runtime, { type: 'processing', phase: event.phase, processedBytes: event.processedBytes, totalBytes: event.totalBytes, sequence: event.sequence })
    })
  }

  async function registerCapabilities() {
    if (registration) return registration
    const epoch = accountEpoch
    registration = registerSession().finally(() => { if (epoch === accountEpoch) registration = undefined })
    return registration
  }

  async function registerSource(source: SourceRecord) {
    if (!socket?.isConnected()) throw new Error('信令未连接')
    const state = states.value[source.transferId]
    if (state?.shareState === 'STOPPED' || state?.shareState === 'RECALLED') return
    await socket.request('P2P_SOURCE_REGISTER', {
      transferId: source.transferId, messageId: source.messageId,
      registrationId: source.registrationId || source.source.sourceId || source.transferId,
      paused: state?.desiredState === 'paused' && state.status !== 'completed',
      ...p2pOfferSummary(source.source),
    }, 10000)
  }

  async function registerSession() {
    if (!socket?.isConnected()) return
    const manager = socket
    const epoch = accountEpoch
    try {
      const result = await socket.request<{ enabled: boolean; p2pFileVersion: number }>('CLIENT_CAPABILITIES', {
        p2pFileVersion: desktopSupported.value ? 2 : 0,
      }, 10000)
      if (epoch !== accountEpoch || manager !== socket) return
      serverEnabled.value = !!result.enabled && result.p2pFileVersion >= 2
      if (!serverEnabled.value) return
      for (const conversationId of Object.keys(peerAvailability.value)) {
        void refreshPeerStatus(conversationId)
      }
      for (const state of Object.values(states.value)) await flushControls(state.transferId)
      for (const source of sources.values()) {
        const state = states.value[source.transferId]
        try {
          if (state?.desiredState !== 'paused' && source.source.sourceId && window.imDesktop?.prepareP2pSource) {
            const prepared = await window.imDesktop.prepareP2pSource(source.source.sourceId)
            if (prepared.manifest.manifestSha256 !== source.source.manifest.manifestSha256) throw new Error('源文件已改变，请作为新文件发送')
          }
          if (epoch !== accountEpoch || manager !== socket) return
          await registerSource(source)
        } catch (error) {
          setState(source.transferId, { status: 'unavailable', pauseReason: 'error', error: readableError(error) })
        }
      }
      for (const [transferId, state] of Object.entries(states.value)) {
        if (state.direction === 'receive' && state.status === 'paused' && state.desiredState === 'running'
          && state.pauseReason === 'network' && incoming.has(transferId)) {
          scheduleResume(transferId, 500)
        }
      }
    } catch {
      serverEnabled.value = false
    }
  }

  function attachSocket(nextSocket: WebSocketManager | null) {
    removeSubscriptions.forEach((remove) => remove())
    removeSubscriptions = []
    socket = nextSocket
    if (!socket) return
    removeSubscriptions = [
      socket.subscribe('P2P_PEER_STATUS', handlePeerStatus),
      socket.subscribe('P2P_TRANSFER_REQUEST', handleTransferRequest),
      socket.subscribe('P2P_SIGNAL', handleSignal),
      socket.subscribe('P2P_TRANSFER_CANCEL', handleRemoteCancel),
      socket.subscribe('P2P_TRANSFER_CLAIMED', handleClaimed),
      socket.subscribe('P2P_SHARE_STATE', handleShareState),
      socket.subscribe('MESSAGE_UPDATED', handleMessageUpdated),
      socket.onConnectionChange((connected) => {
        if (connected) void registerCapabilities()
        else pauseActiveTransfers('信令连接已断开')
      }),
    ]
    if (!watchdog) watchdog = globalThis.setInterval(checkTimeouts, 1000)
    if (socket.isConnected()) void registerCapabilities()
  }

  async function refreshPeerStatus(conversationId: string) {
    if (!socket?.isConnected() || !desktopSupported.value) {
      peerAvailability.value = { ...peerAvailability.value, [conversationId]: false }
      return false
    }
    if (!serverEnabled.value) await registerCapabilities()
    if (!serverEnabled.value) {
      peerAvailability.value = { ...peerAvailability.value, [conversationId]: false }
      return false
    }
    try {
      const result = await socket.request<{ available: boolean; p2pFileVersion: number }>('P2P_PEER_STATUS', { conversationId }, 10000)
      const available = !!result.available && result.p2pFileVersion >= 2
      peerAvailability.value = { ...peerAvailability.value, [conversationId]: available }
      return available
    } catch {
      peerAvailability.value = { ...peerAvailability.value, [conversationId]: false }
      return false
    }
  }

  async function createOffer(
    draft: AttachmentDraft,
    conversationId: string,
    onHashProgress?: (progress: number) => void,
    signal?: AbortSignal,
  ) {
    const offerEpoch = accountEpoch
    if (signal?.aborted) throw new DOMException('发送已暂停', 'AbortError')
    if (!desktopSupported.value) throw new Error('P2P 文件传输仅支持桌面客户端')
    if (!socket?.isConnected() || !serverEnabled.value) throw new Error('P2P 文件传输服务不可用')
    if (!(await refreshPeerStatus(conversationId))) throw new Error('对方桌面端未在线，无法发送 P2P 文件')

    let pending = pendingOffers.get(draft.id)
    if (!pending || pending.conversationId !== conversationId) {
      const epoch = accountEpoch
      let prepared: PreparedP2pSource
      if (draft.nativeSource && window.imDesktop?.prepareP2pSource) {
        const sourceId = draft.nativeSource.sourceId
        const remove = window.imDesktop.onP2pSourceProgress?.((event) => {
          if (event.sourceId === sourceId) onHashProgress?.(event.progress)
        })
        const abort = () => { void window.imDesktop?.cancelP2pSourcePreparation?.(sourceId) }
        signal?.addEventListener('abort', abort, { once: true })
        try {
          const result = await window.imDesktop.prepareP2pSource(sourceId)
          prepared = { sourceId, manifest: result.manifest as P2pManifest, files: result.manifest.files.map((entry) => ({ entry })) }
        } finally { remove?.(); signal?.removeEventListener('abort', abort) }
      } else {
        prepared = draft.kind === 'folder'
          ? await prepareP2pFolder(draft.name, draft.folderFiles || [], onHashProgress, signal, draft.folderDirectories)
          : await prepareP2pFile(draft.file!, onHashProgress, signal)
      }
      if (epoch !== accountEpoch) throw new Error('账号已切换，附件已停止')
      if (signal?.aborted) throw new DOMException('发送已暂停', 'AbortError')
      pending = markRaw({ conversationId, clientMsgId: `p2p-draft-${draft.id}`, source: prepared })
      pendingOffers.set(draft.id, pending)
    } else {
      onHashProgress?.(1)
    }
    const response = await socket.request<OfferResponse>('P2P_OFFER_CREATE', {
      conversationId,
      clientMsgId: pending.clientMsgId,
      registrationId: pending.source.sourceId || pending.clientMsgId,
      ...p2pOfferSummary(pending.source),
    }, 10000)
    if (offerEpoch !== accountEpoch) throw new Error('账号已切换，发送已停止')
    const transferId = String(response.transferId)
    sources.set(transferId, markRaw({
      transferId,
      messageId: String(response.messageId),
      conversationId,
      source: pending.source,
      registrationId: pending.source.sourceId || pending.clientMsgId,
    }))
    const draftStillPresent = pendingOffers.get(draft.id) === pending
    pendingOffers.delete(draft.id)
    setState(transferId, {
      direction: 'send',
      taskId: `offer_${draft.id}`, messageId: String(response.messageId), conversationId,
      name: pending.source.manifest.name, kind: pending.source.manifest.kind,
      fileCount: pending.source.manifest.fileCount, directoryCount: pending.source.manifest.directories?.length || 0, completedFiles: 0,
      content: parseP2pAttachmentContent(response.content) || undefined,
      sourceId: pending.source.sourceId, desiredState: 'running', shareState: 'ACTIVE',
      status: 'waiting',
      progress: 0,
      transferredBytes: 0,
      totalBytes: pending.source.manifest.totalSize,
    })
    await persistState(transferId)
    if (signal?.aborted) {
      if (signal.reason === 'pause' && draftStillPresent) {
        await pauseTransfer(transferId)
        return response
      }
      await stopSharing(transferId)
      throw new DOMException('发送已取消，分享已停止', 'AbortError')
    }
    return response
  }

  async function receiveAttachment(content: P2pAttachmentContent, context?: { messageId: string; conversationId: string }): Promise<boolean> {
    if (!desktopSupported.value || !window.imDesktop?.startP2pReceive) {
      throw new Error('请使用桌面客户端接收 P2P 文件')
    }
    const existing = incoming.get(content.transferId)
    if (existing) {
      return resumeTransfer(content.transferId)
    }
    if (!socket?.isConnected()) throw new Error('信令连接未建立')
    const epoch = accountEpoch
    const availability = await socket.request<{ available: boolean; state: string }>('P2P_SHARE_STATUS', { transferId: content.transferId }, 10000)
    if (!availability.available) throw new Error(shareError(availability.state))
    const selected = await window.imDesktop.startP2pReceive({
      ...content, messageId: context?.messageId || states.value[content.transferId]?.messageId,
      conversationId: context?.conversationId || states.value[content.transferId]?.conversationId,
      transferId: content.transferId,
      kind: content.kind,
      name: content.name,
      totalSize: content.totalSize,
      fileCount: content.fileCount,
    })
    if (selected.canceled) return false
    if (epoch !== accountEpoch) return false
    if (!selected.success || !selected.receiveId || !selected.finalPath) {
      throw new Error(selected.error || '无法创建 P2P 接收任务')
    }
    incoming.set(content.transferId, {
      content,
      receiveId: selected.receiveId,
      finalPath: selected.finalPath,
    })
    const previous = states.value[content.transferId]
    if (previous?.taskId) history.value = [...history.value.filter((item) => item.taskId !== previous.taskId), { ...previous }]
    setState(content.transferId, {
      taskId: selected.taskId || selected.receiveId, content, name: content.name, kind: content.kind,
      messageId: context?.messageId || previous?.messageId,
      conversationId: context?.conversationId || previous?.conversationId,
      fileCount: content.fileCount, directoryCount: content.directoryCount || 0, completedFiles: 0, desiredState: 'running', pauseReason: undefined,
      direction: 'receive',
      status: 'connecting',
      progress: 0,
      transferredBytes: 0,
      totalBytes: content.totalSize,
      receiveId: selected.receiveId,
      localPath: selected.finalPath,
      error: undefined,
    })
    await requestTransfer(content.transferId)
    return true
  }

  async function requestTransfer(transferId: string) {
    if (!socket?.isConnected()) throw new Error('信令连接未建立')
    const attempt = (requestEpochs.get(transferId) || 0) + 1
    requestEpochs.set(transferId, attempt)
    connectionDeadlines.set(transferId, Date.now() + 30000)
    try {
      const response = await socket.request<{ routeId: string }>('P2P_TRANSFER_REQUEST', { transferId }, 10000)
      if (requestEpochs.get(transferId) !== attempt || states.value[transferId]?.desiredState === 'paused') {
        await endRoute(transferId, 'paused', response.routeId)
        return
      }
      setState(transferId, { status: 'connecting', routeId: response.routeId, error: undefined })
    } catch (error) {
      if (requestEpochs.get(transferId) !== attempt) return
      connectionDeadlines.delete(transferId)
      const message = readableError(error)
      const code = Number((error as Error & { code?: number })?.code || 0)
      const raw = error instanceof Error ? error.message : String(error)
      const peerPaused = /SOURCE_PAUSED/i.test(raw)
      const status: P2pTransferStatus = peerPaused ? 'paused' : /P2P_VERSION_UNSUPPORTED/i.test(raw) ? 'unavailable' : code === 409
        ? 'claimed'
        : code === 410 || message.toLowerCase().includes('source') ? 'unavailable' : 'failed'
      setState(transferId, { status, error: message, routeId: undefined,
        ...(peerPaused ? { pauseReason: 'peer' as const } : {}) })
      throw error
    }
  }

  async function resumeTransfer(transferId: string): Promise<boolean> {
    transferId = resolveCurrentId(transferId)
    try { return await resumeTask(transferId) } catch (error) {
      const state = states.value[transferId]
      if (state && !TERMINAL.has(state.status) && state.pauseReason !== 'peer' && state.status !== 'claimed') {
        setState(transferId, { status: sources.has(transferId) ? 'unavailable' : 'failed',
          pauseReason: 'error', error: readableError(error) })
      }
      throw error
    }
  }

  async function resumeTask(transferId: string, automatic = false): Promise<boolean> {
    const epoch = accountEpoch
    if (['STOPPED', 'RECALLED'].includes(states.value[transferId]?.shareState || '')) throw new Error('分享已停止，无法继续')
    await flushControls(transferId)
    if (epoch !== accountEpoch || ['STOPPED', 'RECALLED'].includes(states.value[transferId]?.shareState || '')) return false
    if (states.value[transferId]?.pendingControls?.length) throw new Error('停止操作尚未同步，请连接网络后重试')
    if (!automatic) retryCounts.delete(transferId)
    setState(transferId, { desiredState: 'running', pauseReason: undefined, error: undefined })
    const source = sources.get(transferId)
    if (source) {
      if (source.source.sourceId && window.imDesktop?.prepareP2pSource) {
        const prepared = await window.imDesktop.prepareP2pSource(source.source.sourceId)
        if (epoch !== accountEpoch || states.value[transferId]?.desiredState !== 'running') return false
        if (prepared.manifest.manifestSha256 !== source.source.manifest.manifestSha256) throw new Error('源文件已改变，请重新发送')
      }
      await registerSource(source)
      if (epoch !== accountEpoch || states.value[transferId]?.desiredState !== 'running') return false
      setState(transferId, { status: 'waiting' })
      return true
    }
    if (!incoming.has(transferId)) {
      const state = states.value[transferId]
      if (state?.content) return receiveAttachment(state.content, { conversationId: state.conversationId || '', messageId: state.messageId || '' })
      throw new Error('接收任务已失效，请从原文件消息重新接收')
    }
    clearResumeTimer(transferId)
    const record = incoming.get(transferId)!
    await receiveSuspensions.get(record.receiveId)
    if (epoch !== accountEpoch || incoming.get(transferId) !== record) return false
    if (window.imDesktop?.restoreP2pReceive) {
      const restored = await window.imDesktop.restoreP2pReceive(record.receiveId)
      if (epoch !== accountEpoch || incoming.get(transferId) !== record || states.value[transferId]?.desiredState !== 'running') return false
      if (restored.completed || restored.status === 'completed') {
        setState(transferId, { status: 'completed', progress: 1, localPath: restored.finalPath,
          transferredBytes: record.content.totalSize, completedFiles: record.content.fileCount, error: undefined, routeId: undefined })
        incoming.delete(transferId)
        return true
      }
    }
    await requestTransfer(transferId)
    return true
  }

  function handlePeerStatus(message: WsMessage) {
    if (message.data?.conversationId != null && message.data?.available != null) {
      peerAvailability.value = {
        ...peerAvailability.value,
        [String(message.data.conversationId)]: !!message.data.available && Number(message.data.p2pFileVersion) >= 2,
      }
    }
  }

  function handleTransferRequest(message: WsMessage) {
    const data = message.data
    if (!data?.routeId || !data?.transferId || data.ok != null) return
    const transferId = String(data.transferId)
    const source = sources.get(transferId)
    if (!source) return
    if (states.value[transferId]?.desiredState === 'paused' || ['STOPPED', 'RECALLED'].includes(states.value[transferId]?.shareState || '')) {
      void endRoute(transferId, 'paused', String(data.routeId))
      return
    }
    const activeRuntime = runtimes.get(transferId)
    const activeTransferId = activeOutboundByConversation.get(source.conversationId)
    if (activeTransferId === transferId && activeRuntime?.routeId === String(data.routeId)) {
      return
    }
    if (activeTransferId && activeTransferId !== transferId) {
      if (outboundQueue.some((item) => item.transferId === transferId && item.routeId === String(data.routeId))) return
      outboundQueue.push({ transferId, routeId: String(data.routeId) })
      setState(transferId, { status: 'queued', routeId: String(data.routeId) })
      socket?.send('P2P_SIGNAL', {
        routeId: data.routeId,
        signal: { control: { type: 'queued' } },
      })
      return
    }
    void startSourcePeer(transferId, String(data.routeId))
  }

  async function startSourcePeer(transferId: string, routeId: string) {
    const source = sources.get(transferId)
    const manager = socket
    if (!source || !manager) return
    activeOutboundByConversation.set(source.conversationId, transferId)
    closeRuntime(transferId)
    const runtime = createRuntime(transferId, routeId, 'source')
    runtimes.set(transferId, runtime)
    setState(transferId, { status: 'connecting', routeId, error: undefined })
    const channel = runtime.pc.createDataChannel('arttalk-file-v1', { ordered: true })
    bindDataChannel(runtime, channel)
    try {
      if (source.source.sourceId) await window.imDesktop?.validateP2pSource?.(source.source.sourceId)
      if (!isCurrent(runtime)) return
      const offer = await runtime.pc.createOffer()
      await runtime.pc.setLocalDescription(offer)
      if (runtime.closed || socket !== manager || !manager.isConnected()) return
      manager.send('P2P_SIGNAL', { routeId, signal: { description: runtime.pc.localDescription } })
    } catch (error) {
      failRuntime(runtime, error)
    }
  }

  function createRuntime(transferId: string, routeId: string, role: 'source' | 'receiver') {
    const pc = markRaw(new RTCPeerConnection({ iceServers: [] }))
    const runtime: PeerRuntime = markRaw({
      transferId,
      routeId,
      role,
      pc,
      pendingCandidates: [],
      receiveChain: Promise.resolve(),
      ackOffsets: new Map(),
      fileResults: new Map(),
      sending: false,
      closed: false,
      lastAckSent: new Map(),
      manifestParts: [],
      manifestExpectedChunks: 0,
      manifestLength: 0,
      startedAt: Date.now(), lastProgressAt: Date.now(), lastPeerAt: Date.now(), lastPingAt: 0,
      lastProgressReportAt: 0,
    })
    pc.onicecandidate = (event) => {
      if (event.candidate && isCurrent(runtime)) {
        socket?.send('P2P_SIGNAL', { routeId, signal: { candidate: event.candidate.toJSON() } })
      }
    }
    pc.onconnectionstatechange = () => {
      if (isCurrent(runtime) && ['failed', 'disconnected'].includes(pc.connectionState)) {
        interruptRuntime(runtime, 'P2P 连接已中断')
      }
      if (pc.connectionState === 'closed') runtime.closed = true
    }
    return runtime
  }

  function bindDataChannel(runtime: PeerRuntime, channel: RTCDataChannel) {
    runtime.channel = markRaw(channel)
    channel.binaryType = 'arraybuffer'
    channel.bufferedAmountLowThreshold = P2P_BUFFER_LOW_WATER
    channel.onopen = () => {
      if (!isCurrent(runtime)) return
      runtime.lastProgressAt = Date.now()
      connectionDeadlines.delete(runtime.transferId)
      if (runtime.role === 'source') {
        const source = sources.get(runtime.transferId)
        if (source) {
          void sendSourceManifest(runtime, source.source.manifest)
            .catch((error) => failRuntime(runtime, error))
        }
      } else {
        setState(runtime.transferId, { status: 'receiving', error: undefined })
      }
    }
    channel.onmessage = (event) => {
      if (!isCurrent(runtime)) return
      runtime.lastPeerAt = Date.now()
      if (typeof event.data === 'string') {
        try {
          const control = JSON.parse(event.data)
          if (control.type === 'ping') { sendControl(runtime, { type: 'pong' }); return }
          if (control.type === 'pong') return
          if (control.type === 'processing') {
            // The peer reports real disk/hash progress, not just a live socket.
            const processed = Number(control.processedBytes)
            if (!Number.isSafeInteger(processed) || processed < 0 || processed > (states.value[runtime.transferId]?.totalBytes || 0)) throw new Error('处理进度无效')
            const sequence = Number(control.sequence)
            const newOperation = Number.isSafeInteger(sequence) && sequence > (runtime.processingSequence || 0)
            if (newOperation) runtime.processingSequence = sequence
            if (newOperation || runtime.processingPhase !== control.phase || runtime.processingBytes !== processed) runtime.lastProgressAt = Date.now()
            runtime.processingPhase = control.phase; runtime.processingBytes = processed
            if (control.phase === 'verifying' || control.phase === 'committing') setState(runtime.transferId, {
              status: control.phase, phaseProcessedBytes: processed,
              phaseTotalBytes: Number(control.totalBytes) || states.value[runtime.transferId]?.totalBytes,
            })
            return
          }
          if (control.type === 'route_end') {
            handleRemoteCancel({ cmd: 'P2P_TRANSFER_CANCEL', seq: 0,
              data: { transferId: runtime.transferId, routeId: runtime.routeId, reason: control.reason } })
            return
          }
        } catch { failRuntime(runtime, new Error('收到无效的传输控制数据')); return }
      }
      if (runtime.role === 'receiver') {
        runtime.receiveChain = runtime.receiveChain
          .then(() => handleReceiverData(runtime, event.data))
          .catch((error) => failRuntime(runtime, error))
      } else {
        void handleSourceControl(runtime, event.data).catch((error) => failRuntime(runtime, error))
      }
    }
    channel.onclose = () => {
      if (isCurrent(runtime) && states.value[runtime.transferId]?.status !== 'completed') {
        interruptRuntime(runtime, 'P2P 数据通道已关闭')
      }
    }
    channel.onerror = () => interruptRuntime(runtime, 'P2P 数据通道发生错误')
  }

  async function sendSourceManifest(runtime: PeerRuntime, manifest: P2pManifest) {
    const channel = runtime.channel
    if (!channel || channel.readyState !== 'open') throw new Error('P2P 数据通道未打开')
    const parts = splitP2pManifest(manifest)
    channel.send(JSON.stringify({
      type: 'manifest_begin',
      chunks: parts.length,
      length: parts.reduce((sum, part) => sum + part.length, 0),
    }))
    for (const [index, part] of parts.entries()) {
      await waitForBuffer(channel)
      if (runtime.closed || channel.readyState !== 'open') throw new Error('P2P 数据通道已断开')
      channel.send(JSON.stringify({ type: 'manifest_chunk', index, data: part }))
    }
  }

  async function handleSignal(message: WsMessage) {
    const data = message.data
    if (!data?.routeId || !data?.transferId || !data.signal) return
    const transferId = String(data.transferId)
    const routeId = String(data.routeId)
    if (retiredRoutes.has(routeId)) return
    const state = states.value[transferId]
    if (!state || state.desiredState === 'paused' || TERMINAL.has(state.status)) return
    if (state.routeId && state.routeId !== routeId) return
    const signal = data.signal as {
      description?: RTCSessionDescriptionInit
      candidate?: RTCIceCandidateInit
      control?: { type?: string }
    }
    if (signal.control?.type === 'queued') {
      connectionDeadlines.delete(transferId)
      setState(transferId, { status: 'queued', routeId })
      return
    }
    let runtime = runtimes.get(transferId)
    if (!runtime && signal.description?.type === 'offer' && incoming.has(transferId)) {
      runtime = createRuntime(transferId, routeId, 'receiver')
      runtimes.set(transferId, runtime)
      runtime.pc.ondatachannel = (event) => bindDataChannel(runtime!, event.channel)
    }
    if (!runtime || runtime.routeId !== routeId) return
    try {
      if (signal.description) {
        await runtime.pc.setRemoteDescription(signal.description)
        if (!isCurrent(runtime)) return
        for (const candidate of runtime.pendingCandidates.splice(0)) {
          await runtime.pc.addIceCandidate(candidate)
        }
        if (signal.description.type === 'offer') {
          const answer = await runtime.pc.createAnswer()
          await runtime.pc.setLocalDescription(answer)
          socket?.send('P2P_SIGNAL', { routeId, signal: { description: runtime.pc.localDescription } })
        }
      } else if (signal.candidate) {
        if (runtime.pc.remoteDescription) await runtime.pc.addIceCandidate(signal.candidate)
        else runtime.pendingCandidates.push(signal.candidate)
      }
    } catch (error) {
      failRuntime(runtime, error)
    }
  }

  async function handleReceiverData(runtime: PeerRuntime, data: string | ArrayBuffer | Blob) {
    const record = incoming.get(runtime.transferId)
    const channel = runtime.channel
    if (!record || !channel || channel.readyState !== 'open' || !isCurrent(runtime)) return
    if (typeof data === 'string') {
      const control = JSON.parse(data)
      if (control.type === 'manifest_begin') {
        const chunks = Number(control.chunks)
        const length = Number(control.length)
        if (!Number.isSafeInteger(chunks) || chunks <= 0 || chunks > 2048
          || !Number.isSafeInteger(length) || length <= 0 || length > P2P_MAX_MANIFEST_TEXT) {
          throw new Error('P2P 文件清单声明无效')
        }
        runtime.manifestParts = []
        runtime.manifestExpectedChunks = chunks
        runtime.manifestLength = length
        return
      }
      if (control.type === 'manifest_chunk') {
        if (!runtime.manifestExpectedChunks || Number(control.index) !== runtime.manifestParts.length
          || typeof control.data !== 'string') {
          throw new Error('P2P 文件清单分块顺序无效')
        }
        runtime.manifestParts.push(control.data)
        runtime.lastProgressAt = Date.now()
        const receivedLength = runtime.manifestParts.reduce((sum, part) => sum + part.length, 0)
        if (receivedLength > runtime.manifestLength || receivedLength > P2P_MAX_MANIFEST_TEXT) {
          throw new Error('P2P 文件清单超过声明大小')
        }
        if (runtime.manifestParts.length === runtime.manifestExpectedChunks) {
          if (receivedLength !== runtime.manifestLength) throw new Error('P2P 文件清单长度不匹配')
          const manifest = JSON.parse(runtime.manifestParts.join('')) as P2pManifest
          runtime.manifestParts = []
          runtime.manifestExpectedChunks = 0
          runtime.manifestLength = 0
          await acceptIncomingManifest(runtime, record, manifest)
        }
        return
      }
      if (control.type === 'file_end') {
        if (!record.manifest) throw new Error('未收到文件清单')
        const index = Number(control.index)
        setState(runtime.transferId, { status: 'verifying', currentFile: record.manifest.files[index]?.path })
        sendControl(runtime, { type: 'processing', phase: 'verifying', processedBytes: 0 })
        const result = await window.imDesktop!.finishP2pFile!(record.receiveId, index)
        if (!isCurrent(runtime)) return
        runtime.lastProgressAt = Date.now()
        setState(runtime.transferId, { status: 'receiving', completedFiles: index + 1 })
        channel.send(JSON.stringify({ type: 'file_ok', index, offset: result.offset }))
        return
      }
      if (control.type === 'transfer_end') {
        const epoch = accountEpoch
        const taskId = states.value[runtime.transferId]?.taskId
        setState(runtime.transferId, { status: 'committing' })
        sendControl(runtime, { type: 'processing', phase: 'committing', processedBytes: 0 })
        const result = await window.imDesktop!.commitP2pReceive!(record.receiveId)
        if (epoch !== accountEpoch) return
        if (states.value[runtime.transferId]?.taskId !== taskId) {
          if (taskId) updateTaskRecord(taskId, { status: 'completed', progress: 1, localPath: result.path })
          return
        }
        setState(runtime.transferId, {
          status: 'completed', progress: 1,
          transferredBytes: record.content.totalSize,
          localPath: result.path,
          completedFiles: record.content.fileCount, error: undefined, routeId: undefined,
        })
        if (isCurrent(runtime)) sendControl(runtime, { type: 'completed' })
        void endRoute(runtime.transferId, 'completed', runtime.routeId)
        closeRuntime(runtime.transferId, true)
        incoming.delete(runtime.transferId)
      }
      return
    }
    if (!record.manifest) throw new Error('未收到文件清单')
    const frame = decodeP2pDataFrame(data instanceof Blob ? await data.arrayBuffer() : data)
    const entry = record.manifest.files[frame.fileIndex]
    if (!entry || frame.offset < 0 || frame.offset + frame.payload.byteLength > entry.size) {
      throw new Error('收到越界的 P2P 数据块')
    }
    const written = await window.imDesktop!.writeP2pChunk!(
      record.receiveId, frame.fileIndex, frame.offset, frame.payload,
    )
    if (!isCurrent(runtime)) return
    runtime.lastProgressAt = Date.now()
    const completedBytes = totalBefore(record.manifest, frame.fileIndex) + written.offset
    if (Date.now() - runtime.lastProgressReportAt >= 1000) {
      runtime.lastProgressReportAt = Date.now()
      sendControl(runtime, { type: 'processing', phase: 'receiving', processedBytes: completedBytes })
    }
    setState(runtime.transferId, {
      status: 'receiving',
      progress: Math.min(1, completedBytes / record.manifest.totalSize),
      transferredBytes: completedBytes,
      currentFile: entry.path, completedFiles: frame.fileIndex,
    })
    const lastAck = runtime.lastAckSent.get(frame.fileIndex) || 0
    const durableOffset = written.durableOffset ?? written.offset
    if (durableOffset - lastAck >= P2P_ACK_WINDOW || durableOffset === entry.size) {
      runtime.lastAckSent.set(frame.fileIndex, durableOffset)
      channel.send(JSON.stringify({ type: 'ack', index: frame.fileIndex, offset: durableOffset }))
    }
  }

  async function acceptIncomingManifest(
    runtime: PeerRuntime,
    record: IncomingRecord,
    manifest: P2pManifest,
  ) {
    await validateIncomingManifest(record.content, manifest)
    record.manifest = manifest
    const prepared = await window.imDesktop!.prepareP2pReceive!(record.receiveId, manifest)
    if (!isCurrent(runtime)) return
    const offsets = Object.fromEntries(
      Object.entries(prepared.offsets || {}).map(([key, value]) => [Number(key), Number(value)]),
    )
    runtime.channel?.send(JSON.stringify({ type: 'resume', offsets }))
    setState(runtime.transferId, { status: 'receiving', error: undefined })
  }

  async function validateIncomingManifest(content: P2pAttachmentContent, manifest: P2pManifest) {
    validateP2pManifestStructure(manifest)
    if (manifest.version !== content.version || manifest.kind !== content.kind || manifest.name !== content.name
      || manifest.totalSize !== content.totalSize || manifest.fileCount !== content.fileCount
      || manifest.files.length !== content.fileCount || !(await verifyP2pManifest(manifest))) {
      throw new Error('P2P 文件清单校验失败')
    }
    if (manifest.version === 2 && manifest.directories?.length !== content.directoryCount) throw new Error('P2P 目录数量与消息不一致')
    if (content.kind === 'file' && manifest.files[0]?.sha256 !== content.sha256) {
      throw new Error('P2P 文件哈希与消息不一致')
    }
    if (content.kind === 'folder' && manifest.manifestSha256 !== content.manifestSha256) {
      throw new Error('P2P 文件夹清单哈希与消息不一致')
    }
    const paths = new Set<string>()
    for (const [index, entry] of manifest.files.entries()) {
      const path = normalizeP2pRelativePath(entry.path)
      if (entry.index !== index || entry.size < 0 || paths.has(path.toLowerCase())) {
        throw new Error('P2P 文件清单包含非法条目')
      }
      paths.add(path.toLowerCase())
    }
  }

  async function handleSourceControl(runtime: PeerRuntime, data: unknown) {
    if (typeof data !== 'string' || !isCurrent(runtime)) return
    const control = JSON.parse(data)
    if (control.type === 'resume') {
      runtime.lastProgressAt = Date.now()
      if (!runtime.sending) void sendSourceFiles(runtime, control.offsets || {})
    } else if (control.type === 'ack') {
      const index = Number(control.index)
      const offset = Number(control.offset)
      const entry = sources.get(runtime.transferId)?.source.manifest.files[index]
      if (!entry || !Number.isSafeInteger(offset) || offset < (runtime.ackOffsets.get(index) || 0) || offset > entry.size) throw new Error('P2P 接收确认偏移无效')
      if (offset > (runtime.ackOffsets.get(index) || 0)) runtime.lastProgressAt = Date.now()
      runtime.ackOffsets.set(index, offset)
    } else if (control.type === 'file_ok') {
      const entry = sources.get(runtime.transferId)?.source.manifest.files[Number(control.index)]
      if (!entry || Number(control.offset) !== entry.size) throw new Error('P2P 文件完成确认无效')
      runtime.ackOffsets.set(Number(control.index), Number(control.offset))
      runtime.fileResults.set(Number(control.index), 'ok')
      runtime.lastProgressAt = Date.now()
      setState(runtime.transferId, { completedFiles: Number(control.index) + 1 })
    } else if (control.type === 'completed') {
      if (!runtime.sending && states.value[runtime.transferId]?.status === 'connecting') return
      setState(runtime.transferId, {
        status: 'completed', progress: 1,
        transferredBytes: states.value[runtime.transferId]?.totalBytes || 0,
        completedFiles: states.value[runtime.transferId]?.fileCount, error: undefined, routeId: undefined,
      })
      finishOutbound(runtime.transferId)
      closeRuntime(runtime.transferId, true)
    }
  }

  async function sendSourceFiles(runtime: PeerRuntime, rawOffsets: Record<string, number>) {
    const record = sources.get(runtime.transferId)
    const channel = runtime.channel
    if (!record || !channel) return
    runtime.sending = true
    try {
      for (const sourceFile of record.source.files) {
        const { entry, file } = sourceFile
        const requestedOffset = Number(rawOffsets[entry.index] || 0)
        let offset = Number.isSafeInteger(requestedOffset)
          ? Math.max(0, Math.min(entry.size, requestedOffset))
          : 0
        runtime.ackOffsets.set(entry.index, offset)
        while (offset < entry.size) {
          if (runtime.closed || channel.readyState !== 'open') throw new Error('P2P 数据通道已断开')
          await waitForBuffer(channel)
          while (offset - (runtime.ackOffsets.get(entry.index) || 0) >= P2P_ACK_WINDOW) {
            if (runtime.closed || channel.readyState !== 'open') throw new Error('P2P 数据通道已断开')
            await wait(20)
          }
          const next = Math.min(entry.size, offset + P2P_CHUNK_SIZE)
          const payload = record.source.sourceId && window.imDesktop?.readP2pSourceChunk
            ? await window.imDesktop.readP2pSourceChunk(record.source.sourceId, entry.index, offset, next - offset)
            : await file!.slice(offset, next).arrayBuffer()
          if (!isCurrent(runtime)) return
          channel.send(encodeP2pDataFrame(entry.index, offset, payload))
          runtime.lastProgressAt = Date.now()
          offset = next
          const sentBytes = totalBefore(record.source.manifest, entry.index) + offset
          setState(runtime.transferId, {
            status: 'sending',
            progress: record.source.manifest.totalSize ? sentBytes / record.source.manifest.totalSize : 0,
            transferredBytes: sentBytes,
            currentFile: entry.path, completedFiles: entry.index,
          })
        }
        channel.send(JSON.stringify({ type: 'file_end', index: entry.index }))
        setState(runtime.transferId, { status: 'verifying' })
        while (runtime.fileResults.get(entry.index) !== 'ok') {
          if (runtime.closed || channel.readyState !== 'open') throw new Error('P2P 数据通道已断开')
          await wait(20)
        }
      }
      if (record.source.sourceId) await window.imDesktop?.validateP2pSource?.(record.source.sourceId)
      if (!isCurrent(runtime)) return
      channel.send(JSON.stringify({ type: 'transfer_end' }))
      setState(runtime.transferId, { status: 'committing' })
    } catch (error) {
      if (isCurrent(runtime)) failRuntime(runtime, error)
    } finally {
      runtime.sending = false
    }
  }

  function waitForBuffer(channel: RTCDataChannel) {
    if (channel.bufferedAmount <= P2P_BUFFER_HIGH_WATER) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        channel.removeEventListener('bufferedamountlow', ready)
        channel.removeEventListener('close', closed)
        channel.removeEventListener('error', closed)
      }
      const ready = () => {
        cleanup()
        resolve()
      }
      const closed = () => {
        cleanup()
        reject(new Error('P2P 数据通道已断开'))
      }
      channel.addEventListener('bufferedamountlow', ready)
      channel.addEventListener('close', closed)
      channel.addEventListener('error', closed)
    })
  }

  function pauseRuntime(runtime: PeerRuntime, reason: string, autoResume = true) {
    if (!isCurrent(runtime)) return
    closeRuntime(runtime.transferId)
    setState(runtime.transferId, { status: 'paused', routeId: undefined, pauseReason: autoResume ? 'network' : 'manual', error: reason })
    if (runtime.role === 'receiver') void suspendReceive(runtime.transferId, autoResume ? 'network' : 'manual').catch(() => undefined)
    if (autoResume && runtime.role === 'receiver' && incoming.has(runtime.transferId)) {
      scheduleResume(runtime.transferId)
    }
    if (runtime.role === 'source') finishOutbound(runtime.transferId)
  }

  function interruptRuntime(runtime: PeerRuntime, reason: string) {
    if (!isCurrent(runtime)) return
    void endRoute(runtime.transferId, 'peer_disconnected', runtime.routeId)
    pauseRuntime(runtime, reason)
  }

  function failRuntime(runtime: PeerRuntime, error: unknown) {
    if (!isCurrent(runtime)) return
    const message = readableError(error)
    void endRoute(runtime.transferId, 'failed', runtime.routeId)
    setState(runtime.transferId, { status: 'failed', pauseReason: 'error', error: message, routeId: undefined })
    closeRuntime(runtime.transferId)
    if (runtime.role === 'receiver') {
      void suspendReceive(runtime.transferId, 'error').catch(() => undefined)
    } else {
      finishOutbound(runtime.transferId)
    }
  }

  function closeRuntime(transferId: string, _completed = false) {
    connectionDeadlines.delete(transferId)
    const runtime = runtimes.get(transferId)
    if (!runtime) return
    retiredRoutes.add(runtime.routeId)
    runtime.closed = true
    runtime.channel?.close()
    runtime.pc.close()
    runtimes.delete(transferId)
  }

  function finishOutbound(transferId: string) {
    const active = [...activeOutboundByConversation.entries()]
      .find(([, activeTransferId]) => activeTransferId === transferId)
    if (!active) return
    const [conversationId] = active
    activeOutboundByConversation.delete(conversationId)
    const nextIndex = outboundQueue.findIndex((item) =>
      sources.get(item.transferId)?.conversationId === conversationId)
    const next = nextIndex >= 0 ? outboundQueue.splice(nextIndex, 1)[0] : undefined
    if (next && socket?.isConnected() && states.value[next.transferId]?.desiredState !== 'paused') void startSourcePeer(next.transferId, next.routeId)
  }

  function removeQueuedTransfer(transferId: string) {
    for (let index = outboundQueue.length - 1; index >= 0; index -= 1) {
      if (outboundQueue[index].transferId === transferId) outboundQueue.splice(index, 1)
    }
  }

  function handleRemoteCancel(message: WsMessage) {
    const data = message.data
    if (!data?.transferId || data.ok != null) return
    const transferId = String(data.transferId)
    const reason = String(data.reason || 'peer_cancelled')
    if (['source_cancelled', 'source_stopped', 'recalled'].includes(reason)) {
      void invalidateShare(transferId, reason === 'recalled' ? 'RECALLED' : 'STOPPED')
      return
    }
    const state = states.value[transferId]
    if (!state || !state.routeId || state.routeId !== String(data.routeId)) return
    clearResumeTimer(transferId)
    removeQueuedTransfer(transferId)
    if (reason === 'completed') {
      if (!sources.has(transferId)) return
      setState(transferId, {
        status: 'completed', progress: 1,
        transferredBytes: states.value[transferId]?.totalBytes || 0,
        error: undefined,
        routeId: undefined, completedFiles: state.fileCount,
      })
      closeRuntime(transferId, true)
      finishOutbound(transferId)
      return
    }
    closeRuntime(transferId)
    if (sources.has(transferId)) {
      setState(transferId, { status: state.desiredState === 'paused' ? 'paused' : 'waiting', routeId: undefined,
        error: reason === 'paused' ? '接收方已暂停' : reason === 'cancelled' ? '对方已取消本次接收，仍可再次接收' : undefined })
      finishOutbound(transferId)
    } else if (incoming.has(transferId)) {
      void suspendReceive(transferId, reason === 'peer_disconnected' ? 'network' : 'peer').catch(() => undefined)
      setState(transferId, {
        status: 'paused', routeId: undefined,
        pauseReason: reason === 'peer_disconnected' ? 'network' : 'peer',
        error: reason === 'peer_disconnected'
          ? '发送方连接已断开'
          : reason === 'paused' ? '发送方已暂停' : '对方已结束本次传输，可重试',
      })
      if (reason === 'peer_disconnected') {
        scheduleResume(transferId)
      }
    }
  }

  function handleClaimed(message: WsMessage) {
    const transferId = String(message.data?.transferId || '')
    if (!transferId || states.value[transferId]?.status === 'completed') return
    if (message.data?.claimed === false) {
      if (states.value[transferId]?.status === 'claimed') {
        setState(transferId, { direction: 'receive', status: incoming.has(transferId) ? 'paused' : 'waiting', error: undefined })
        if (incoming.has(transferId) && states.value[transferId]?.desiredState === 'running') {
          setState(transferId, { pauseReason: 'network' })
          scheduleResume(transferId, 500)
        }
      }
      return
    }
    if (!incoming.has(transferId)) setState(transferId, { direction: 'receive', status: 'claimed', error: '其他设备正在接收，结束后可在本机接收' })
  }

  function pauseActiveTransfers(reason: string) {
    outboundQueue.splice(0)
    activeOutboundByConversation.clear()
    for (const [transferId, state] of Object.entries(states.value)) {
      if (state.desiredState === 'paused' || TERMINAL.has(state.status)) continue
      clearResumeTimer(transferId)
      requestEpochs.set(transferId, (requestEpochs.get(transferId) || 0) + 1)
      closeRuntime(transferId)
      setState(transferId, { status: 'paused', routeId: undefined, pauseReason: 'network', error: reason })
      void suspendReceive(transferId, 'network').catch(() => undefined)
    }
  }

  function clearResumeTimer(transferId: string) {
    const timer = resumeTimers.get(transferId)
    if (timer) globalThis.clearTimeout(timer)
    resumeTimers.delete(transferId)
  }

  function scheduleResume(transferId: string, delay?: number) {
    const state = states.value[transferId]
    if (resumeTimers.has(transferId) || !incoming.has(transferId) || state?.desiredState !== 'running'
      || state.pauseReason !== 'network') return
    const count = retryCounts.get(transferId) || 0
    if (count >= RETRY_DELAYS.length) {
      setState(transferId, { status: 'failed', pauseReason: 'error', error: '已尝试重新连接三次，请检查双方网络后点击重试' })
      return
    }
    const timer = globalThis.setTimeout(async () => {
      resumeTimers.delete(transferId)
      if (!socket?.isConnected() || !incoming.has(transferId) || states.value[transferId]?.desiredState !== 'running') return
      retryCounts.set(transferId, count + 1)
      await resumeTask(transferId, true).catch(() => {
        if (states.value[transferId]?.pauseReason === 'peer' || states.value[transferId]?.status === 'claimed') return
        setState(transferId, { status: 'paused', pauseReason: 'network' })
        scheduleResume(transferId)
      })
    }, delay ?? RETRY_DELAYS[count])
    resumeTimers.set(transferId, timer)
  }

  async function pauseTransfer(transferId: string) {
    transferId = resolveCurrentId(transferId)
    clearResumeTimer(transferId)
    requestEpochs.set(transferId, (requestEpochs.get(transferId) || 0) + 1)
    const routeId = states.value[transferId]?.routeId
    setState(transferId, { status: 'paused', desiredState: 'paused', pauseReason: 'manual', error: '已暂停' })
    const end = endRoute(transferId, 'paused', routeId)
    closeRuntime(transferId)
    removeQueuedTransfer(transferId)
    setState(transferId, { routeId: undefined })
    finishOutbound(transferId)
    await suspendReceive(transferId, 'manual')
    const source = sources.get(transferId)
    if (source && socket?.isConnected()) await registerSource(source).catch(() => undefined)
    await end
    await persistState(transferId)
  }

  async function cancelTransfer(transferId: string) {
    transferId = resolveCurrentId(transferId)
    const epoch = accountEpoch
    clearResumeTimer(transferId)
    const runtime = runtimes.get(transferId)
    const routeId = runtime?.routeId || states.value[transferId]?.routeId
    requestEpochs.set(transferId, (requestEpochs.get(transferId) || 0) + 1)
    const end = endRoute(transferId, 'cancelled', routeId)
    closeRuntime(transferId)
    const receive = incoming.get(transferId)
    if (receive) await receiveSuspensions.get(receive.receiveId)?.catch(() => undefined)
    if (epoch !== accountEpoch) return
    if (receive) await window.imDesktop?.abortP2pReceive?.(receive.receiveId)
    if (epoch !== accountEpoch) return
    incoming.delete(transferId)
    removeQueuedTransfer(transferId)
    setState(transferId, { status: sources.has(transferId) ? 'waiting' : 'cancelled',
      desiredState: sources.has(transferId) ? 'running' : 'paused', routeId: undefined, error: undefined })
    finishOutbound(transferId)
    await end
    await persistState(transferId)
    if (receive) await refreshCleanupState(transferId, epoch)
  }

  async function openCompleted(transferId: string) {
    const result = await window.imDesktop?.openP2pResult?.(transferId)
    if (!result?.success) {
      updateTaskRecord(transferId, { error: result?.error || '本地文件不可用，可定位文件或重新接收' })
      throw new Error(result?.error || '本地文件不可用，可定位文件或重新接收')
    }
    return result.path
  }

  async function revealCompleted(transferId: string) {
    const result = await window.imDesktop?.revealP2pResult?.(transferId)
    if (!result?.success) throw new Error(result?.error || '本地文件不可用')
    return result.path
  }

  function readableError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if (/checksum|hash mismatch/i.test(message)) return '文件校验失败，请重试损坏的文件'
    if (/ENOSPC|space/i.test(message)) return '磁盘空间不足，请释放空间或更换保存位置'
    if (/EACCES|EPERM|permission/i.test(message)) return '文件或保存目录没有读写权限，请重新选择位置'
    if (/ENOENT|source.*(missing|unavailable|not available)/i.test(message)) return '源文件或磁盘不可用，请发送方定位源文件'
    if (/timeout|timed out/i.test(message)) return '连接或处理超时，请检查双方网络后重试'
    if (/SOURCE_PAUSED|source.*paused/i.test(message)) return '发送方已暂停，请等待对方继续'
    if (/P2P_VERSION_UNSUPPORTED/i.test(message)) return '客户端版本不兼容，请双方升级桌面端'
    if (/source.*offline/i.test(message)) return '发送方未在线，请等待原发送设备上线'
    if (/claimed|busy/i.test(message)) return '其他设备正在接收，请稍后重试'
    return message
  }

  function shareError(state: string) {
    return ({ source_offline: '发送方未在线，请等待原发送设备上线', source_busy: '其他设备正在接收，请稍后重试',
      source_paused: '发送方已暂停，请等待对方继续', stopped: '发送方已取消发送', recalled: '文件消息已撤回',
      incompatible: '对方客户端版本不兼容，请升级桌面端' } as Record<string, string>)[state] || '分享暂不可用，请稍后重试'
  }

  function isCurrent(runtime: PeerRuntime) {
    return !runtime.closed && runtimes.get(runtime.transferId) === runtime
  }

  function sendControl(runtime: PeerRuntime, control: Record<string, unknown>) {
    if (runtime.channel?.readyState === 'open' && isCurrent(runtime)) runtime.channel.send(JSON.stringify(control))
  }

  async function queueControl(transferId: string, cmd: string, data: Record<string, unknown>) {
    if (!states.value[transferId]) return
    const pending = states.value[transferId]!.pendingControls || []
    const key = JSON.stringify({ cmd, data })
    if (!pending.some((item) => JSON.stringify(item) === key)) {
      setState(transferId, { pendingControls: [...pending, { cmd, data }] })
      await persistState(transferId)
    }
    await flushControls(transferId)
  }

  async function flushControls(transferId: string) {
    if (flushing.has(transferId)) return flushing.get(transferId)
    const epoch = accountEpoch
    const work = (async () => {
      while (states.value[transferId]?.pendingControls?.length && epoch === accountEpoch) {
        if (!socket?.isConnected()) {
          setState(transferId, { error: '已在本机停止，等待联网同步' })
          return
        }
        const operation = states.value[transferId]!.pendingControls![0]!
        try {
          await socket.request(operation.cmd, operation.data, 10000)
          if (epoch !== accountEpoch || !states.value[transferId]) return
          const error = states.value[transferId]!.error
          setState(transferId, { pendingControls: states.value[transferId]!.pendingControls!.filter((item) => item !== operation),
            ...(operation.cmd === 'P2P_SHARE_STOP' ? { shareState: 'STOPPED' } : {}),
            error: error?.startsWith('已在本机停止，等待') ? undefined : error })
          await persistState(transferId)
        } catch (error) {
          if (operation.cmd === 'P2P_ROUTE_END' && Number((error as { code?: number }).code) === 410) {
            setState(transferId, { pendingControls: states.value[transferId]!.pendingControls!.filter((item) => item !== operation) })
            continue
          }
          if (epoch === accountEpoch) setState(transferId, { error: `已在本机停止，等待同步：${readableError(error)}` })
          return
        }
      }
    })().finally(() => { if (flushing.get(transferId) === work) flushing.delete(transferId) })
    flushing.set(transferId, work)
    return work
  }

  async function endRoute(transferId: string, reason: string, routeId = states.value[transferId]?.routeId) {
    if (!routeId) return
    retiredRoutes.add(routeId)
    const runtime = runtimes.get(transferId)
    if (runtime?.routeId === routeId) sendControl(runtime, { type: 'route_end', reason })
    await queueControl(transferId, 'P2P_ROUTE_END', { transferId, routeId, reason })
  }

  async function stopSharing(id: string) {
    const transferId = resolveCurrentId(id)
    const state = states.value[transferId]
    if (state?.direction !== 'send') throw new Error('只有发送方可以停止分享')
    clearResumeTimer(transferId)
    const runtime = runtimes.get(transferId)
    if (runtime) sendControl(runtime, { type: 'route_end', reason: 'source_stopped' })
    requestEpochs.set(transferId, (requestEpochs.get(transferId) || 0) + 1)
    closeRuntime(transferId)
    removeQueuedTransfer(transferId)
    setState(transferId, { status: 'stopped', desiredState: 'paused', shareState: 'STOPPED', routeId: undefined })
    finishOutbound(transferId)
    await queueControl(transferId, 'P2P_SHARE_STOP', { transferId })
    sources.delete(transferId)
  }

  async function invalidateShare(transferId: string, shareState: 'RECALLED' | 'STOPPED') {
    if (!states.value[transferId]) return
    const epoch = accountEpoch
    clearResumeTimer(transferId)
    requestEpochs.set(transferId, (requestEpochs.get(transferId) || 0) + 1)
    const runtime = runtimes.get(transferId)
    if (runtime) sendControl(runtime, { type: 'route_end', reason: shareState === 'RECALLED' ? 'recalled' : 'source_stopped' })
    closeRuntime(transferId)
    removeQueuedTransfer(transferId)
    const state = states.value[transferId]!
    const received = incoming.get(transferId)
    incoming.delete(transferId)
    sources.delete(transferId)
    setState(transferId, { shareState, routeId: undefined, desiredState: 'paused',
      status: state.status === 'completed' && state.direction === 'receive' ? 'completed' : shareState === 'RECALLED' ? 'recalled' : 'stopped',
      error: shareState === 'RECALLED' ? '文件消息已撤回' : '发送方已取消发送' })
    finishOutbound(transferId)
    if (received) {
      await receiveSuspensions.get(received.receiveId)?.catch(() => undefined)
      if (epoch !== accountEpoch) return
      await window.imDesktop?.abortP2pReceive?.(received.receiveId)
    }
    if (epoch !== accountEpoch) return
    await persistState(transferId)
    if (received) await refreshCleanupState(transferId, epoch)
  }

  async function refreshCleanupState(transferId: string, epoch: number) {
    const taskId = states.value[transferId]?.taskId
    const records = await window.imDesktop?.listP2pTasks?.()
    if (epoch !== accountEpoch || states.value[transferId]?.taskId !== taskId) return
    const record = records?.find((task) => task.taskId === taskId)
    if (record) setState(transferId, { cleanupPending: record.cleanupPending, cleanupError: record.cleanupError,
      ...(record.cleanupPending ? { error: record.cleanupError } : {}) })
  }

  function handleShareState(message: WsMessage) {
    const data = message.data
    if (!data?.transferId || data.ok != null) return
    const id = String(data.transferId)
    if (data.shareState === 'RECALLED' || data.shareState === 'STOPPED') void invalidateShare(id, data.shareState)
    else if (data.state === 'available') {
      const state = states.value[id]
      if (state?.direction === 'receive' && state.desiredState === 'running' && ['network', 'peer'].includes(state.pauseReason || '')) {
        setState(id, { status: 'paused', pauseReason: 'network' })
        scheduleResume(id, 500)
      }
    }
  }

  function handleMessageUpdated(message: WsMessage) {
    const updated = message.data?.message || message.data
    if (!updated || updated.status !== 'RECALLED') return
    const state = Object.values(states.value).find((item) => item.messageId === String(updated.messageId))
    if (state) void invalidateShare(state.transferId, 'RECALLED')
  }

  function checkTimeouts() {
    const now = Date.now()
    for (const runtime of [...runtimes.values()]) {
      const state = states.value[runtime.transferId]
      if (!state || state.status === 'queued') continue
      const opened = runtime.channel?.readyState === 'open'
      if ((!opened && now - runtime.startedAt > 30000) || (opened && now - runtime.lastProgressAt > 30000)) {
        interruptRuntime(runtime, opened ? '传输长时间没有进展，请检查对方设备' : 'P2P 直连超时，请确认双方局域网可达')
      } else if (opened && now - runtime.lastPingAt >= 10000) {
        runtime.lastPingAt = now
        sendControl(runtime, { type: 'ping' })
      }
    }
    for (const [transferId, deadline] of connectionDeadlines) {
      if (now < deadline || runtimes.has(transferId)) continue
      connectionDeadlines.delete(transferId)
      void endRoute(transferId, 'peer_disconnected')
      setState(transferId, { status: 'paused', pauseReason: 'network', routeId: undefined, error: '等待对方连接超时' })
      scheduleResume(transferId)
    }
  }

  async function locateSource(id: string) {
    const transferId = resolveCurrentId(id)
    const source = sources.get(transferId)
    if (!source?.source.sourceId) throw new Error('此历史任务没有保存源文件位置，请重新发送')
    const result = await window.imDesktop?.locateP2pSource?.(source.source.sourceId)
    if (result?.canceled) return false
    if (!result?.manifest || result.manifest.manifestSha256 !== source.source.manifest.manifestSha256) throw new Error('所选内容与原文件不一致，请作为新文件发送')
    await resumeTransfer(transferId)
    return true
  }

  async function locateResult(id: string) {
    const result = await window.imDesktop?.locateP2pResult?.(id)
    if (result?.canceled) return false
    if (!result?.success) throw new Error(result?.error || '定位文件失败')
    updateTaskRecord(id, { localPath: result.path, error: undefined })
    return true
  }

  async function retryCleanup(id: string) {
    const epoch = accountEpoch
    const result = await window.imDesktop?.retryP2pCleanup?.(id)
    if (epoch !== accountEpoch || !result) return false
    updateTaskRecord(id, { cleanupPending: result.cleanupPending, cleanupError: result.error, error: result.error })
    return result.success
  }

  async function changeDestination(id: string) {
    const transferId = resolveCurrentId(id)
    await pauseTransfer(transferId)
    const record = incoming.get(transferId)
    if (!record) throw new Error('请重新接收文件')
    const result = await window.imDesktop?.changeP2pReceiveDestination?.(record.receiveId)
    if (result?.canceled) return false
    if (!result?.success) throw new Error(result?.error || '更换保存位置失败')
    record.finalPath = result.finalPath || record.finalPath
    setState(transferId, { localPath: record.finalPath, error: undefined })
    return true
  }

  async function receiveAgain(id: string) {
    const transferId = resolveId(id)
    const state = tasks.value.find((task) => task.taskId === id) || states.value[transferId]
    if (incoming.has(transferId)) throw new Error('本机已有此文件的未完成任务，请先完成或取消当前任务')
    if (!state?.content) throw new Error('请从原文件消息重新接收')
    return receiveAttachment(state.content, { messageId: state.messageId || '', conversationId: state.conversationId || '' })
  }

  function discardPreparedDraft(draftId: string) {
    pendingOffers.delete(draftId)
  }

  function discardPreparedConversation(conversationId: string) {
    for (const [draftId, pending] of pendingOffers) {
      if (pending.conversationId === conversationId) pendingOffers.delete(draftId)
    }
  }

  function dispose(beforeAccountClear: Promise<unknown>[] = []) {
    disposalBarriers.push(...beforeAccountClear)
    if (disposal) return disposal
    disposal = disposeSession().finally(() => { disposal = undefined })
    return disposal
  }

  async function disposeSession() {
    accountEpoch++
    removeSubscriptions.forEach((remove) => remove())
    removeSubscriptions = []
    removeNativeProgress?.()
    removeNativeProgress = undefined
    if (watchdog) globalThis.clearInterval(watchdog)
    watchdog = undefined
    for (const timer of resumeTimers.values()) globalThis.clearTimeout(timer)
    resumeTimers.clear()
    for (const runtime of [...runtimes.values()]) closeRuntime(runtime.transferId)
    for (const [id, state] of Object.entries(states.value)) {
      if (!TERMINAL.has(state.status)) setState(id, { status: 'paused', desiredState: 'paused', pauseReason: 'restart', routeId: undefined })
    }
    await Promise.allSettled([...persistQueue.values(), ...receiveSuspensions.values(), ...[...incoming.keys()].map((id) => suspendReceive(id, 'restart'))])
    while (disposalBarriers.length) await Promise.allSettled(disposalBarriers.splice(0))
    if (accountId) await window.imDesktop?.setP2pAccount?.(null)
    accountId = ''
    localReady.value = !window.imDesktop?.setP2pAccount
    accountEpoch++
    registration = undefined
    incoming.clear()
    receiveSuspensions.clear()
    pendingOffers.clear()
    sources.clear()
    outboundQueue.splice(0)
    activeOutboundByConversation.clear()
    states.value = {}
    history.value = []
    restoredDrafts.value = []
    connectionDeadlines.clear()
    requestEpochs.clear()
    retryCounts.clear()
    speedSamples.clear()
    retiredRoutes.clear()
    peerAvailability.value = {}
    serverEnabled.value = false
    socket = null
  }

  return {
    states,
    tasks,
    restoredDrafts,
    restoreAccount,
    peerAvailability,
    serverEnabled,
    desktopSupported,
    attachSocket,
    refreshPeerStatus,
    createOffer,
    receiveAttachment,
    resumeTransfer,
    pauseTransfer,
    cancelTransfer,
    stopSharing,
    locateSource,
    locateResult,
    retryCleanup,
    receiveAgain,
    changeDestination,
    openCompleted,
    revealCompleted,
    discardPreparedDraft,
    discardPreparedConversation,
    stateFor,
    dispose,
  }
})
