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
  type P2pAttachmentContent,
  type P2pManifest,
  type PreparedP2pSource,
} from '../utils/p2pProtocol'

export type P2pTransferStatus =
  | 'preparing' | 'waiting' | 'connecting' | 'queued'
  | 'sending' | 'receiving' | 'paused' | 'completed'
  | 'failed' | 'cancelled' | 'claimed' | 'unavailable'

export interface P2pTransferState {
  transferId: string
  direction: 'send' | 'receive'
  status: P2pTransferStatus
  progress: number
  transferredBytes: number
  totalBytes: number
  error?: string
  routeId?: string
  receiveId?: string
  localPath?: string
}

interface SourceRecord {
  transferId: string
  messageId: string
  conversationId: string
  source: PreparedP2pSource
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

const COMPLETED_STORAGE_KEY = 'p2pCompletedPathsV1'
const manifestPrefixOffsets = new WeakMap<P2pManifest, number[]>()

function wait(ms: number) {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms))
}

function randomId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`
}

function isDesktopP2pAvailable() {
  const desktop = window.imDesktop
  return !!(desktop?.startP2pReceive && desktop.prepareP2pReceive && desktop.writeP2pChunk
    && desktop.finishP2pFile && desktop.commitP2pReceive && desktop.abortP2pReceive)
}

function readCompletedPaths() {
  try {
    const value = JSON.parse(localStorage.getItem(COMPLETED_STORAGE_KEY) || '{}')
    return value && typeof value === 'object' ? value as Record<string, string> : {}
  } catch {
    return {}
  }
}

function saveCompletedPath(transferId: string, path: string) {
  const values = readCompletedPaths()
  values[transferId] = path
  const entries = Object.entries(values).slice(-200)
  localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
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
  const desktopSupported = computed(isDesktopP2pAvailable)

  let socket: WebSocketManager | null = null
  let removeSubscriptions: Array<() => void> = []
  const sources = new Map<string, SourceRecord>()
  const incoming = new Map<string, IncomingRecord>()
  const pendingOffers = new Map<string, PendingOffer>()
  const runtimes = new Map<string, PeerRuntime>()
  const outboundQueue: Array<{ transferId: string; routeId: string }> = []
  const activeOutboundByConversation = new Map<string, string>()
  const resumeTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function setState(transferId: string, changes: Partial<P2pTransferState>) {
    const current = states.value[transferId] || {
      transferId,
      direction: sources.has(transferId) ? 'send' : 'receive',
      status: 'waiting',
      progress: 0,
      transferredBytes: 0,
      totalBytes: 0,
    }
    states.value = { ...states.value, [transferId]: { ...current, ...changes } }
  }

  function stateFor(transferId: string) {
    const completed = readCompletedPaths()[transferId]
    if (completed && !states.value[transferId]) {
      setState(transferId, { direction: 'receive', status: 'completed', progress: 1, localPath: completed })
    }
    return states.value[transferId]
  }

  async function registerCapabilities() {
    if (!socket?.isConnected()) return
    try {
      const result = await socket.request<{ enabled: boolean; p2pFileVersion: number }>('CLIENT_CAPABILITIES', {
        p2pFileVersion: desktopSupported.value ? 1 : 0,
      })
      serverEnabled.value = !!result.enabled && result.p2pFileVersion === 1
      if (!serverEnabled.value) return
      for (const conversationId of Object.keys(peerAvailability.value)) {
        void refreshPeerStatus(conversationId)
      }
      for (const source of sources.values()) {
        await socket.request('P2P_SOURCE_REGISTER', {
          transferId: source.transferId,
          messageId: source.messageId,
        }).catch(() => undefined)
      }
      for (const [transferId, state] of Object.entries(states.value)) {
        if (state.direction === 'receive' && state.status === 'paused' && incoming.has(transferId)) {
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
      socket.onConnectionChange((connected) => {
        if (connected) void registerCapabilities()
        else pauseActiveTransfers('信令连接已断开')
      }),
    ]
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
      const result = await socket.request<{ available: boolean }>('P2P_PEER_STATUS', { conversationId })
      peerAvailability.value = { ...peerAvailability.value, [conversationId]: !!result.available }
      return !!result.available
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
    if (!desktopSupported.value) throw new Error('P2P 文件传输仅支持桌面客户端')
    if (!socket?.isConnected() || !serverEnabled.value) throw new Error('P2P 文件传输服务不可用')
    if (!(await refreshPeerStatus(conversationId))) throw new Error('对方桌面端未在线，无法发送 P2P 文件')

    let pending = pendingOffers.get(draft.id)
    if (!pending || pending.conversationId !== conversationId) {
      const prepared = draft.kind === 'folder'
        ? await prepareP2pFolder(draft.name, draft.folderFiles || [], onHashProgress, signal)
        : await prepareP2pFile(draft.file, onHashProgress, signal)
      if (signal?.aborted) throw new DOMException('发送已暂停', 'AbortError')
      pending = markRaw({ conversationId, clientMsgId: randomId('p2p'), source: prepared })
      pendingOffers.set(draft.id, pending)
    } else {
      onHashProgress?.(1)
    }
    const response = await socket.request<OfferResponse>('P2P_OFFER_CREATE', {
      conversationId,
      clientMsgId: pending.clientMsgId,
      ...p2pOfferSummary(pending.source),
    }, 20_000)
    const transferId = String(response.transferId)
    sources.set(transferId, markRaw({
      transferId,
      messageId: String(response.messageId),
      conversationId,
      source: pending.source,
    }))
    pendingOffers.delete(draft.id)
    setState(transferId, {
      direction: 'send',
      status: 'waiting',
      progress: 0,
      transferredBytes: 0,
      totalBytes: pending.source.manifest.totalSize,
    })
    return response
  }

  async function receiveAttachment(content: P2pAttachmentContent) {
    if (!desktopSupported.value || !window.imDesktop?.startP2pReceive) {
      throw new Error('请使用桌面客户端接收 P2P 文件')
    }
    const existing = incoming.get(content.transferId)
    if (existing) {
      return resumeTransfer(content.transferId)
    }
    const selected = await window.imDesktop.startP2pReceive({
      transferId: content.transferId,
      kind: content.kind,
      name: content.name,
      totalSize: content.totalSize,
      fileCount: content.fileCount,
    })
    if (selected.canceled) return false
    if (!selected.success || !selected.receiveId || !selected.finalPath) {
      throw new Error(selected.error || '无法创建 P2P 接收任务')
    }
    incoming.set(content.transferId, {
      content,
      receiveId: selected.receiveId,
      finalPath: selected.finalPath,
    })
    setState(content.transferId, {
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
    try {
      const response = await socket.request<{ routeId: string }>('P2P_TRANSFER_REQUEST', { transferId })
      setState(transferId, { status: 'connecting', routeId: response.routeId, error: undefined })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const code = Number((error as Error & { code?: number })?.code || 0)
      const status: P2pTransferStatus = code === 409
        ? 'claimed'
        : code === 410 || message.toLowerCase().includes('source') ? 'unavailable' : 'failed'
      setState(transferId, { status, error: message })
      if (status === 'claimed') {
        const record = incoming.get(transferId)
        if (record) await window.imDesktop?.abortP2pReceive?.(record.receiveId)
        incoming.delete(transferId)
      }
      throw error
    }
  }

  async function resumeTransfer(transferId: string) {
    if (!incoming.has(transferId)) throw new Error('接收任务已失效，请重新选择保存位置')
    clearResumeTimer(transferId)
    await requestTransfer(transferId)
    return true
  }

  function handlePeerStatus(message: WsMessage) {
    if (message.data?.conversationId != null && message.data?.available != null) {
      peerAvailability.value = {
        ...peerAvailability.value,
        [String(message.data.conversationId)]: !!message.data.available,
      }
    }
  }

  function handleTransferRequest(message: WsMessage) {
    const data = message.data
    if (!data?.routeId || !data?.transferId || data.ok != null) return
    const transferId = String(data.transferId)
    const source = sources.get(transferId)
    if (!source) return
    const activeRuntime = runtimes.get(transferId)
    const activeTransferId = activeOutboundByConversation.get(source.conversationId)
    if (activeTransferId === transferId && activeRuntime?.routeId === String(data.routeId)) {
      return
    }
    if (activeTransferId && activeTransferId !== transferId) {
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
    })
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.send('P2P_SIGNAL', { routeId, signal: { candidate: event.candidate.toJSON() } })
      }
    }
    pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected'].includes(pc.connectionState)) {
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
      if (runtime.role === 'receiver') {
        runtime.receiveChain = runtime.receiveChain
          .then(() => handleReceiverData(runtime, event.data))
          .catch((error) => failRuntime(runtime, error))
      } else {
        void handleSourceControl(runtime, event.data).catch((error) => failRuntime(runtime, error))
      }
    }
    channel.onclose = () => {
      if (!runtime.closed && states.value[runtime.transferId]?.status !== 'completed') {
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
    const signal = data.signal as {
      description?: RTCSessionDescriptionInit
      candidate?: RTCIceCandidateInit
      control?: { type?: string }
    }
    if (signal.control?.type === 'queued') {
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
    if (!record || !channel || channel.readyState !== 'open') return
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
        const result = await window.imDesktop!.finishP2pFile!(record.receiveId, index)
        channel.send(JSON.stringify({ type: 'file_ok', index, offset: result.offset }))
        return
      }
      if (control.type === 'transfer_end') {
        const result = await window.imDesktop!.commitP2pReceive!(record.receiveId)
        saveCompletedPath(runtime.transferId, result.path)
        setState(runtime.transferId, {
          status: 'completed', progress: 1,
          transferredBytes: record.content.totalSize,
          localPath: result.path,
        })
        channel.send(JSON.stringify({ type: 'completed' }))
        socket?.send('P2P_TRANSFER_CANCEL', {
          routeId: runtime.routeId,
          transferId: runtime.transferId,
          reason: 'completed',
        })
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
    const completedBytes = totalBefore(record.manifest, frame.fileIndex) + written.offset
    setState(runtime.transferId, {
      status: 'receiving',
      progress: Math.min(1, completedBytes / record.manifest.totalSize),
      transferredBytes: completedBytes,
    })
    const lastAck = runtime.lastAckSent.get(frame.fileIndex) || 0
    if (written.offset - lastAck >= P2P_ACK_WINDOW || written.offset === entry.size) {
      runtime.lastAckSent.set(frame.fileIndex, written.offset)
      channel.send(JSON.stringify({ type: 'ack', index: frame.fileIndex, offset: written.offset }))
    }
  }

  async function acceptIncomingManifest(
    runtime: PeerRuntime,
    record: IncomingRecord,
    manifest: P2pManifest,
  ) {
    await validateIncomingManifest(record.content, manifest)
    record.manifest = manifest
    const prepared = await window.imDesktop!.prepareP2pReceive!(record.receiveId, manifest.files)
    const offsets = Object.fromEntries(
      Object.entries(prepared.offsets || {}).map(([key, value]) => [Number(key), Number(value)]),
    )
    runtime.channel?.send(JSON.stringify({ type: 'resume', offsets }))
    setState(runtime.transferId, { status: 'receiving', error: undefined })
  }

  async function validateIncomingManifest(content: P2pAttachmentContent, manifest: P2pManifest) {
    if (manifest.version !== 1 || manifest.kind !== content.kind || manifest.name !== content.name
      || manifest.totalSize !== content.totalSize || manifest.fileCount !== content.fileCount
      || manifest.files.length !== content.fileCount || !(await verifyP2pManifest(manifest))) {
      throw new Error('P2P 文件清单校验失败')
    }
    if (content.kind === 'file' && manifest.files[0]?.sha256 !== content.sha256) {
      throw new Error('P2P 文件哈希与消息不一致')
    }
    if (content.kind === 'folder' && manifest.manifestSha256 !== content.manifestSha256) {
      throw new Error('P2P 文件夹清单哈希与消息不一致')
    }
    const paths = new Set<string>()
    for (const [index, entry] of manifest.files.entries()) {
      const path = normalizeP2pRelativePath(entry.path)
      if (entry.index !== index || entry.size <= 0 || paths.has(path.toLowerCase())) {
        throw new Error('P2P 文件清单包含非法条目')
      }
      paths.add(path.toLowerCase())
    }
  }

  async function handleSourceControl(runtime: PeerRuntime, data: unknown) {
    if (typeof data !== 'string') return
    const control = JSON.parse(data)
    if (control.type === 'resume') {
      if (!runtime.sending) void sendSourceFiles(runtime, control.offsets || {})
    } else if (control.type === 'ack') {
      runtime.ackOffsets.set(Number(control.index), Number(control.offset))
    } else if (control.type === 'file_ok') {
      runtime.ackOffsets.set(Number(control.index), Number(control.offset))
      runtime.fileResults.set(Number(control.index), 'ok')
    } else if (control.type === 'completed') {
      sources.delete(runtime.transferId)
      setState(runtime.transferId, {
        status: 'completed', progress: 1,
        transferredBytes: states.value[runtime.transferId]?.totalBytes || 0,
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
          const payload = await file.slice(offset, next).arrayBuffer()
          channel.send(encodeP2pDataFrame(entry.index, offset, payload))
          offset = next
          const sentBytes = totalBefore(record.source.manifest, entry.index) + offset
          setState(runtime.transferId, {
            status: 'sending',
            progress: sentBytes / record.source.manifest.totalSize,
            transferredBytes: sentBytes,
          })
        }
        channel.send(JSON.stringify({ type: 'file_end', index: entry.index }))
        while (runtime.fileResults.get(entry.index) !== 'ok') {
          if (runtime.closed || channel.readyState !== 'open') throw new Error('P2P 数据通道已断开')
          await wait(20)
        }
      }
      channel.send(JSON.stringify({ type: 'transfer_end' }))
    } catch (error) {
      pauseRuntime(runtime, error instanceof Error ? error.message : String(error))
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
    if (runtime.closed || states.value[runtime.transferId]?.status === 'completed') return
    runtime.closed = true
    runtime.channel?.close()
    runtime.pc.close()
    runtimes.delete(runtime.transferId)
    setState(runtime.transferId, { status: 'paused', error: reason })
    if (autoResume && runtime.role === 'receiver' && incoming.has(runtime.transferId)) {
      scheduleResume(runtime.transferId)
    }
    if (runtime.role === 'source') finishOutbound(runtime.transferId)
  }

  function interruptRuntime(runtime: PeerRuntime, reason: string) {
    if (runtime.closed) return
    socket?.send('P2P_TRANSFER_CANCEL', {
      routeId: runtime.routeId,
      transferId: runtime.transferId,
      reason: 'peer_disconnected',
    })
    pauseRuntime(runtime, reason)
  }

  function failRuntime(runtime: PeerRuntime, error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    setState(runtime.transferId, { status: 'failed', error: message })
    closeRuntime(runtime.transferId)
    if (runtime.role === 'receiver') {
      const record = incoming.get(runtime.transferId)
      if (record) void window.imDesktop?.abortP2pReceive?.(record.receiveId)
      incoming.delete(runtime.transferId)
    } else {
      finishOutbound(runtime.transferId)
    }
  }

  function closeRuntime(transferId: string, completed = false) {
    const runtime = runtimes.get(transferId)
    if (!runtime) return
    runtime.closed = true
    runtime.channel?.close()
    runtime.pc.close()
    runtimes.delete(transferId)
    if (!completed && states.value[transferId]?.status === 'connecting') {
      setState(transferId, { status: 'paused' })
    }
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
    if (next) void startSourcePeer(next.transferId, next.routeId)
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
    clearResumeTimer(transferId)
    removeQueuedTransfer(transferId)
    if (reason === 'completed') {
      sources.delete(transferId)
      setState(transferId, {
        status: 'completed', progress: 1,
        transferredBytes: states.value[transferId]?.totalBytes || 0,
        error: undefined,
      })
      closeRuntime(transferId, true)
      finishOutbound(transferId)
      return
    }
    closeRuntime(transferId)
    if (sources.has(transferId)) {
      setState(transferId, { status: 'waiting', error: reason === 'paused' ? '接收方已暂停' : undefined })
      finishOutbound(transferId)
    } else if (incoming.has(transferId)) {
      const resumable = reason === 'peer_disconnected' || reason === 'paused'
      setState(transferId, {
        status: resumable ? 'paused' : 'cancelled',
        error: reason === 'peer_disconnected'
          ? '发送方连接已断开'
          : reason === 'paused' ? '发送方已暂停' : undefined,
      })
      if (reason === 'peer_disconnected') {
        scheduleResume(transferId)
      } else if (!resumable) {
        const record = incoming.get(transferId)
        if (record) void window.imDesktop?.abortP2pReceive?.(record.receiveId)
        incoming.delete(transferId)
      }
    } else {
      setState(transferId, {
        direction: 'receive',
        status: reason === 'source_cancelled' ? 'unavailable' : 'cancelled',
        error: reason === 'source_cancelled' ? '发送方已取消共享' : undefined,
      })
    }
  }

  function handleClaimed(message: WsMessage) {
    const transferId = String(message.data?.transferId || '')
    if (!transferId || incoming.has(transferId)) return
    if (message.data?.claimed === false) {
      if (states.value[transferId]?.status === 'claimed') {
        setState(transferId, { direction: 'receive', status: 'waiting', error: undefined })
      }
      return
    }
    setState(transferId, { direction: 'receive', status: 'claimed', error: '已在其他设备接收' })
  }

  function pauseActiveTransfers(reason: string) {
    for (const runtime of [...runtimes.values()]) pauseRuntime(runtime, reason)
  }

  function clearResumeTimer(transferId: string) {
    const timer = resumeTimers.get(transferId)
    if (timer) globalThis.clearTimeout(timer)
    resumeTimers.delete(transferId)
  }

  function scheduleResume(transferId: string, delay = 2000) {
    if (resumeTimers.has(transferId)) return
    const timer = globalThis.setTimeout(async () => {
      resumeTimers.delete(transferId)
      if (!socket?.isConnected() || !incoming.has(transferId)) {
        scheduleResume(transferId, 3000)
        return
      }
      await resumeTransfer(transferId).catch(() => scheduleResume(transferId, 3000))
    }, delay)
    resumeTimers.set(transferId, timer)
  }

  function pauseTransfer(transferId: string) {
    clearResumeTimer(transferId)
    const runtime = runtimes.get(transferId)
    if (runtime) {
      socket?.send('P2P_TRANSFER_CANCEL', {
        routeId: runtime.routeId,
        transferId,
        reason: 'paused',
      })
      pauseRuntime(runtime, '已暂停', false)
    }
  }

  async function cancelTransfer(transferId: string) {
    clearResumeTimer(transferId)
    const runtime = runtimes.get(transferId)
    const routeId = runtime?.routeId || states.value[transferId]?.routeId
    if (routeId) {
      socket?.send('P2P_TRANSFER_CANCEL', {
        routeId,
        transferId,
        reason: 'cancelled',
        releaseSource: sources.has(transferId),
      })
    } else if (sources.has(transferId)) {
      socket?.send('P2P_TRANSFER_CANCEL', { transferId, reason: 'cancelled' })
    }
    closeRuntime(transferId)
    const receive = incoming.get(transferId)
    if (receive) await window.imDesktop?.abortP2pReceive?.(receive.receiveId)
    incoming.delete(transferId)
    sources.delete(transferId)
    removeQueuedTransfer(transferId)
    setState(transferId, { status: 'cancelled', error: undefined })
    finishOutbound(transferId)
  }

  async function openCompleted(transferId: string) {
    const result = await window.imDesktop?.openP2pResult?.(transferId)
    if (!result?.success) throw new Error(result?.error || '本地文件不可用')
    return result.path
  }

  async function revealCompleted(transferId: string) {
    const result = await window.imDesktop?.revealP2pResult?.(transferId)
    if (!result?.success) throw new Error(result?.error || '本地文件不可用')
    return result.path
  }

  function discardPreparedDraft(draftId: string) {
    pendingOffers.delete(draftId)
  }

  function discardPreparedConversation(conversationId: string) {
    for (const [draftId, pending] of pendingOffers) {
      if (pending.conversationId === conversationId) pendingOffers.delete(draftId)
    }
  }

  function dispose() {
    removeSubscriptions.forEach((remove) => remove())
    removeSubscriptions = []
    for (const timer of resumeTimers.values()) globalThis.clearTimeout(timer)
    resumeTimers.clear()
    for (const runtime of [...runtimes.values()]) closeRuntime(runtime.transferId)
    for (const receive of incoming.values()) {
      void window.imDesktop?.abortP2pReceive?.(receive.receiveId)
    }
    incoming.clear()
    pendingOffers.clear()
    sources.clear()
    outboundQueue.splice(0)
    activeOutboundByConversation.clear()
    states.value = {}
    peerAvailability.value = {}
    serverEnabled.value = false
    socket = null
  }

  return {
    states,
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
    openCompleted,
    revealCompleted,
    discardPreparedDraft,
    discardPreparedConversation,
    stateFor,
    dispose,
  }
})
