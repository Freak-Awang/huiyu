import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { WsMessage } from '../utils/websocket'

vi.mock('../utils/fileHash', () => ({
  hashFile: vi.fn(async (_file: File, onProgress?: (progress: number) => void) => {
    onProgress?.(1)
    return 'a'.repeat(64)
  }),
}))

import { useP2pTransferStore } from './p2pTransfers'
import { prepareP2pFile, p2pOfferSummary } from '../utils/p2pProtocol'

type WsHandler = (message: WsMessage) => void

class FakeSocket {
  handlers = new Map<string, Set<WsHandler>>()
  offerCount = 0
  sent: Array<{ cmd: string; data: any }> = []
  connected = true
  connectionHandler?: (connected: boolean) => void

  isConnected() { return this.connected }

  async request(cmd: string, data: any) {
    this.sent.push({ cmd, data })
    if (cmd === 'CLIENT_CAPABILITIES') return { enabled: true, p2pFileVersion: 2 }
    if (cmd === 'P2P_PEER_STATUS') return { available: true, p2pFileVersion: 2 }
    if (cmd === 'P2P_SHARE_STATUS') return { available: true, state: 'available' }
    if (cmd === 'P2P_OFFER_CREATE') {
      this.offerCount += 1
      const transferId = `p2p_${this.offerCount}`
      return {
        transferId,
        messageId: String(this.offerCount),
        conversationId: String(data.conversationId),
        messageType: 'FILE',
        content: JSON.stringify({ ...data, transferMode: 'p2p_lan', transferId }),
        clientMsgId: data.clientMsgId,
        status: 'SENT',
      }
    }
    if (cmd === 'P2P_TRANSFER_REQUEST') return { routeId: `route_${data.transferId}` }
    return { ok: true }
  }

  send(cmd: string, data: any) {
    this.sent.push({ cmd, data })
    return true
  }

  subscribe(cmd: string, handler: WsHandler) {
    const handlers = this.handlers.get(cmd) || new Set<WsHandler>()
    handlers.add(handler)
    this.handlers.set(cmd, handlers)
    return () => handlers.delete(handler)
  }

  onConnectionChange(handler: (connected: boolean) => void) { this.connectionHandler = handler; return () => { this.connectionHandler = undefined } }
  connection(connected: boolean) { this.connected = connected; this.connectionHandler?.(connected) }

  emit(cmd: string, data: any) {
    const message = { cmd, seq: 0, data }
    this.handlers.get(cmd)?.forEach((handler) => handler(message))
  }
}

class FakeDataChannel extends EventTarget {
  readyState: RTCDataChannelState = 'open'
  bufferedAmount = 0
  bufferedAmountLowThreshold = 0
  binaryType: BinaryType = 'arraybuffer'
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  sent: unknown[] = []

  send(data: unknown) { this.sent.push(data) }
  close() { this.readyState = 'closed'; this.onclose?.(new Event('close')) }
}

class FakePeerConnection {
  static instances: FakePeerConnection[] = []
  connectionState: RTCPeerConnectionState = 'new'
  localDescription: RTCSessionDescription | null = null
  remoteDescription: RTCSessionDescription | null = null
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null = null
  channel?: FakeDataChannel

  constructor() { FakePeerConnection.instances.push(this) }
  createDataChannel() { this.channel = new FakeDataChannel(); return this.channel as unknown as RTCDataChannel }
  async createOffer() { return { type: 'offer' as const, sdp: 'offer' } }
  async createAnswer() { return { type: 'answer' as const, sdp: 'answer' } }
  async setLocalDescription(value: RTCSessionDescriptionInit) { this.localDescription = value as RTCSessionDescription }
  async setRemoteDescription(value: RTCSessionDescriptionInit) { this.remoteDescription = value as RTCSessionDescription }
  async addIceCandidate() { return undefined }
  close() { this.connectionState = 'closed'; this.onconnectionstatechange?.() }
}

function draft(name: string, conversationId: string) {
  return {
    id: name,
    conversationId,
    kind: 'file' as const,
    file: { name, size: 1, type: 'text/plain', lastModified: 1 } as File,
    name,
    size: 1,
    mimeType: 'text/plain',
    lastModified: 1,
    status: 'waiting' as const,
    progress: 0,
  }
}

describe('P2P transfer store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    FakePeerConnection.instances = []
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
    vi.stubGlobal('window', {
      imDesktop: {
        startP2pReceive: vi.fn(),
        prepareP2pReceive: vi.fn(),
        writeP2pChunk: vi.fn(),
        finishP2pFile: vi.fn(),
        commitP2pReceive: vi.fn(),
        abortP2pReceive: vi.fn(),
      },
    })
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection)
  })

  it('keeps only one outbound transfer active per peer and ignores duplicate completion', async () => {
    const socket = new FakeSocket()
    const store = useP2pTransferStore()
    store.attachSocket(socket as never)
    await vi.waitFor(() => expect(store.serverEnabled).toBe(true))

    await store.createOffer(draft('one.txt', 'conversation-1'), 'conversation-1')
    await store.createOffer(draft('two.txt', 'conversation-1'), 'conversation-1')
    await store.createOffer(draft('three.txt', 'conversation-1'), 'conversation-1')
    socket.emit('P2P_TRANSFER_REQUEST', { transferId: 'p2p_1', routeId: 'route_1' })
    socket.emit('P2P_TRANSFER_REQUEST', { transferId: 'p2p_2', routeId: 'route_2' })
    socket.emit('P2P_TRANSFER_REQUEST', { transferId: 'p2p_3', routeId: 'route_3' })
    await vi.waitFor(() => expect(FakePeerConnection.instances).toHaveLength(1))
    expect(store.states.p2p_2.status).toBe('queued')
    expect(store.states.p2p_3.status).toBe('queued')

    socket.emit('P2P_TRANSFER_CANCEL', { transferId: 'p2p_1', routeId: 'route_1', reason: 'completed' })
    await vi.waitFor(() => expect(FakePeerConnection.instances).toHaveLength(2))
    socket.emit('P2P_TRANSFER_CANCEL', { transferId: 'p2p_1', routeId: 'route_1', reason: 'completed' })

    expect(FakePeerConnection.instances).toHaveLength(2)
    expect(store.states.p2p_2.status).toBe('connecting')
    expect(store.states.p2p_3.status).toBe('queued')
    await store.dispose()
  })

  it('allows different direct conversations to transfer concurrently', async () => {
    const socket = new FakeSocket()
    const store = useP2pTransferStore()
    store.attachSocket(socket as never)
    await vi.waitFor(() => expect(store.serverEnabled).toBe(true))

    await store.createOffer(draft('one.txt', 'conversation-1'), 'conversation-1')
    await store.createOffer(draft('two.txt', 'conversation-2'), 'conversation-2')
    socket.emit('P2P_TRANSFER_REQUEST', { transferId: 'p2p_1', routeId: 'route_1' })
    socket.emit('P2P_TRANSFER_REQUEST', { transferId: 'p2p_2', routeId: 'route_2' })

    await vi.waitFor(() => expect(FakePeerConnection.instances).toHaveLength(2))
    expect(store.states.p2p_1.status).toBe('connecting')
    expect(store.states.p2p_2.status).toBe('connecting')
    await store.dispose()
  })

  it('pauses a queued transfer before a peer runtime exists and preserves manual pause after reconnect', async () => {
    const socket = new FakeSocket()
    const store = useP2pTransferStore()
    store.attachSocket(socket as never)
    await vi.waitFor(() => expect(store.serverEnabled).toBe(true))
    await store.createOffer(draft('one', 'conversation-1'), 'conversation-1')
    await store.createOffer(draft('two', 'conversation-1'), 'conversation-1')
    socket.emit('P2P_TRANSFER_REQUEST', { transferId: 'p2p_1', routeId: 'r1' })
    socket.emit('P2P_TRANSFER_REQUEST', { transferId: 'p2p_2', routeId: 'r2' })
    await store.pauseTransfer('p2p_2')
    expect(store.states.p2p_2.status).toBe('paused')
    expect(store.states.p2p_2.desiredState).toBe('paused')
    expect(socket.sent.some((request) => request.cmd === 'P2P_ROUTE_END' && request.data.routeId === 'r2')).toBe(true)
    socket.connection(false)
    socket.connection(true)
    await vi.waitFor(() => expect(store.serverEnabled).toBe(true))
    expect(store.states.p2p_2.pauseReason).toBe('manual')
    socket.emit('P2P_TRANSFER_CANCEL', { transferId: 'p2p_1', routeId: 'r1', reason: 'completed' })
    expect(FakePeerConnection.instances).toHaveLength(1)
    await store.dispose()
  })

  it('keeps the source after completion, permits another device, and ignores stale route cancellation', async () => {
    const socket = new FakeSocket()
    const store = useP2pTransferStore()
    store.attachSocket(socket as never)
    await vi.waitFor(() => expect(store.serverEnabled).toBe(true))
    await store.createOffer(draft('one', 'c1'), 'c1')
    socket.emit('P2P_TRANSFER_REQUEST', { transferId: 'p2p_1', routeId: 'first' })
    socket.emit('P2P_TRANSFER_CANCEL', { transferId: 'p2p_1', routeId: 'first', reason: 'completed' })
    expect(store.states.p2p_1.status).toBe('completed')
    socket.emit('P2P_TRANSFER_REQUEST', { transferId: 'p2p_1', routeId: 'second' })
    expect(store.states.p2p_1.routeId).toBe('second')
    socket.emit('P2P_TRANSFER_CANCEL', { transferId: 'p2p_1', routeId: 'first', reason: 'cancelled' })
    expect(store.states.p2p_1.status).toBe('connecting')
    expect(FakePeerConnection.instances).toHaveLength(2)
    await store.dispose()
  })

  it('stops an active connection on recall and rejects later receive requests', async () => {
    const socket = new FakeSocket()
    const store = useP2pTransferStore()
    store.attachSocket(socket as never)
    await vi.waitFor(() => expect(store.serverEnabled).toBe(true))
    await store.createOffer(draft('one', 'c1'), 'c1')
    socket.emit('P2P_TRANSFER_REQUEST', { transferId: 'p2p_1', routeId: 'active' })
    socket.emit('P2P_SHARE_STATE', { transferId: 'p2p_1', shareState: 'RECALLED' })
    expect(store.states.p2p_1.status).toBe('recalled')
    expect(FakePeerConnection.instances[0]?.connectionState).toBe('closed')
    socket.emit('P2P_TRANSFER_REQUEST', { transferId: 'p2p_1', routeId: 'late' })
    expect(FakePeerConnection.instances).toHaveLength(1)
    await store.dispose()
  })

  it('separates cancel-current from permanent stop and synchronizes a disconnected stop later', async () => {
    const socket = new FakeSocket()
    const store = useP2pTransferStore()
    store.attachSocket(socket as never)
    await vi.waitFor(() => expect(store.serverEnabled).toBe(true))
    await store.createOffer(draft('one', 'c1'), 'c1')
    socket.emit('P2P_TRANSFER_REQUEST', { transferId: 'p2p_1', routeId: 'active' })
    await store.cancelTransfer('p2p_1')
    expect(store.states.p2p_1.status).toBe('waiting')
    expect(socket.sent.some((request) => request.cmd === 'P2P_SHARE_STOP')).toBe(false)
    socket.connection(false)
    await store.stopSharing('p2p_1')
    expect(store.states.p2p_1.pendingControls).toHaveLength(1)
    socket.connection(true)
    await vi.waitFor(() => expect(store.states.p2p_1.pendingControls).toEqual([]))
    expect(socket.sent.some((request) => request.cmd === 'P2P_SHARE_STOP')).toBe(true)
    await store.dispose()
  })

  it('restores incomplete tasks paused and registers completed shares without auto-resuming receives', async () => {
    const source = await prepareP2pFile(draft('one', 'c1').file)
    const content = { ...p2pOfferSummary(source), transferMode: 'p2p_lan', transferId: 'p2p_receive' }
    const records = [
      { taskId: 'incomplete', receiveId: 'incomplete', transferId: 'p2p_receive', messageId: '1', conversationId: 'c1',
        direction: 'receive', status: 'receiving', totalSize: 1, transferredBytes: 0, name: 'one', kind: 'file',
        fileCount: 1, directoryCount: 0, manifest: source.manifest, content },
      { taskId: 'complete', sourceId: 'source', transferId: 'p2p_send', messageId: '2', conversationId: 'c1',
        direction: 'send', status: 'completed', totalSize: 1, transferredBytes: 1, name: 'one', kind: 'file',
        fileCount: 1, directoryCount: 0, manifest: source.manifest },
    ]
    Object.assign(window.imDesktop!, {
      setP2pAccount: vi.fn(async (id) => id ? records : []), saveP2pTask: vi.fn(async () => undefined),
      suspendP2pReceive: vi.fn(async () => true), prepareP2pSource: vi.fn(async () => ({ manifest: source.manifest })),
    })
    const store = useP2pTransferStore()
    await store.restoreAccount('account')
    const socket = new FakeSocket()
    store.attachSocket(socket as never)
    await vi.waitFor(() => expect(socket.sent.some((call) => call.cmd === 'P2P_SOURCE_REGISTER')).toBe(true))
    expect(store.states.p2p_receive.status).toBe('paused')
    expect(store.states.p2p_receive.pauseReason).toBe('restart')
    expect(socket.sent.some((call) => call.cmd === 'P2P_TRANSFER_REQUEST')).toBe(false)
    socket.emit('P2P_TRANSFER_REQUEST', { transferId: 'p2p_send', routeId: 'second-device' })
    expect(store.states.p2p_send.status).toBe('connecting')
    await store.dispose()
    expect(window.imDesktop!.abortP2pReceive).not.toHaveBeenCalled()
  })

  it('times out a connection that makes no progress instead of displaying sending indefinitely', async () => {
    const socket = new FakeSocket()
    const store = useP2pTransferStore()
    store.attachSocket(socket as never)
    await vi.waitFor(() => expect(store.serverEnabled).toBe(true))
    await store.createOffer(draft('one', 'c1'), 'c1')
    const realNow = Date.now
    const started = realNow()
    socket.emit('P2P_TRANSFER_REQUEST', { transferId: 'p2p_1', routeId: 'stalled' })
    vi.spyOn(Date, 'now').mockReturnValue(started + 31000)
    await vi.waitFor(() => expect(store.states.p2p_1.status).toBe('paused'), { timeout: 2000 })
    expect(store.states.p2p_1.error).toContain('没有进展')
    vi.restoreAllMocks()
    await store.dispose()
  })

  it.each(['pause', 'cancel'] as const)('handles %s while the offer acknowledgement is in flight', async (reason) => {
    const socket = new FakeSocket()
    const store = useP2pTransferStore()
    store.attachSocket(socket as never)
    await vi.waitFor(() => expect(store.serverEnabled).toBe(true))
    const original = socket.request.bind(socket)
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let offered = false
    socket.request = async (cmd, data) => {
      if (cmd === 'P2P_OFFER_CREATE') { offered = true; await gate }
      return original(cmd, data)
    }
    const controller = new AbortController()
    const result = store.createOffer(draft('pending', 'c1'), 'c1', undefined, controller.signal)
    const checked = reason === 'cancel' ? expect(result).rejects.toThrow('发送已取消') : result
    await vi.waitFor(() => expect(offered).toBe(true))
    controller.abort(reason)
    if (reason === 'cancel') store.discardPreparedDraft('pending')
    release()
    await checked
    expect(store.states.p2p_1.status).toBe(reason === 'pause' ? 'paused' : 'stopped')
    expect(socket.sent.some((call) => call.cmd === 'P2P_SHARE_STOP')).toBe(reason === 'cancel')
    expect(socket.sent.find((call) => call.cmd === 'P2P_OFFER_CREATE')!.data.clientMsgId).toBe('p2p-draft-pending')
    await store.dispose()
  })

  it('keeps old history actions separate from a newer receive and sends cloneable persistence DTOs', async () => {
    const prepared = await prepareP2pFile(draft('one', 'c1').file)
    const content = { ...p2pOfferSummary(prepared), transferMode: 'p2p_lan', transferId: 'p2p_shared' }
    const record = { transferId: 'p2p_shared', messageId: '1', conversationId: 'c1', direction: 'receive',
      totalSize: 1, name: 'one', kind: 'file', fileCount: 1, directoryCount: 0, manifest: prepared.manifest, content }
    const records = [{ ...record, taskId: 'old', receiveId: 'old', status: 'completed', localPath: 'old-location' },
      { ...record, taskId: 'new', receiveId: 'new', status: 'paused', localPath: 'new-location' }]
    const saved: any[] = []
    Object.assign(window.imDesktop!, {
      setP2pAccount: vi.fn(async (id) => id ? records : []),
      saveP2pTask: vi.fn(async (payload) => { saved.push(structuredClone(payload)) }),
      suspendP2pReceive: vi.fn(async () => true),
      locateP2pResult: vi.fn(async () => ({ success: true, path: 'relocated-old' })),
      openP2pResult: vi.fn(async () => ({ success: false, error: 'old file missing' })),
    })
    const store = useP2pTransferStore()
    await store.restoreAccount('account')
    await store.locateResult('old')
    expect(store.tasks.find((task) => task.taskId === 'old')?.localPath).toBe('relocated-old')
    expect(store.states.p2p_shared.localPath).toBe('new-location')
    await expect(store.openCompleted('old')).rejects.toThrow('old file missing')
    expect(store.states.p2p_shared.error).not.toBe('old file missing')
    await expect(store.cancelTransfer('old')).rejects.toThrow('历史记录')
    await expect(store.receiveAgain('old')).rejects.toThrow('未完成任务')
    await store.pauseTransfer('new')
    expect(saved.length).toBeGreaterThan(0)
    expect(saved.at(-1).content).toEqual(content)
    expect(saved.at(-1).routeId).toBeNull()
    expect(store.states.p2p_shared.error).not.toContain('任务保存失败')
    await store.dispose()
  })

  it('recognizes a reconciled disk commit on continue without creating another receive', async () => {
    const prepared = await prepareP2pFile(draft('one', 'c1').file)
    const content = { ...p2pOfferSummary(prepared), transferMode: 'p2p_lan', transferId: 'p2p_commit' }
    Object.assign(window.imDesktop!, {
      setP2pAccount: vi.fn(async (id) => id ? [{ taskId: 'commit', receiveId: 'commit', transferId: 'p2p_commit',
        messageId: '1', conversationId: 'c1', direction: 'receive', status: 'paused', name: 'one', kind: 'file',
        fileCount: 1, directoryCount: 0, totalSize: 1, manifest: prepared.manifest, content }] : []),
      saveP2pTask: vi.fn(async () => undefined), suspendP2pReceive: vi.fn(async () => true),
      restoreP2pReceive: vi.fn(async () => ({ completed: true, status: 'completed', finalPath: 'committed-file' })),
    })
    const store = useP2pTransferStore()
    await store.restoreAccount('account')
    const socket = new FakeSocket()
    store.attachSocket(socket as never)
    await store.resumeTransfer('commit')
    expect(store.states.p2p_commit.status).toBe('completed')
    expect(store.states.p2p_commit.localPath).toBe('committed-file')
    expect(socket.sent.some((call) => call.cmd === 'P2P_TRANSFER_REQUEST')).toBe(false)
    expect(window.imDesktop!.startP2pReceive).not.toHaveBeenCalled()
    await store.dispose()
  })

  it('awaits native disk suspension before restoring the receive port on automatic reconnect', async () => {
    const prepared = await prepareP2pFile(draft('one', 'c1').file)
    const content = { ...p2pOfferSummary(prepared), transferMode: 'p2p_lan', transferId: 'p2p_reconnect' }
    const events: string[] = []
    let release!: () => void
    let disconnected = false
    const suspension = new Promise<boolean>((resolve) => { release = () => { events.push('suspended'); resolve(true) } })
    Object.assign(window.imDesktop!, {
      setP2pAccount: vi.fn(async (id) => id ? [{ taskId: 'reconnect', receiveId: 'reconnect', transferId: 'p2p_reconnect',
        messageId: '1', conversationId: 'c1', direction: 'receive', status: 'paused', name: 'one', kind: 'file',
        fileCount: 1, directoryCount: 0, totalSize: 1, manifest: prepared.manifest, content }] : []),
      saveP2pTask: vi.fn(async () => undefined),
      suspendP2pReceive: vi.fn(() => disconnected ? suspension : Promise.resolve(true)),
      restoreP2pReceive: vi.fn(async () => { events.push('restored'); return { status: 'paused', finalPath: 'received-file' } }),
    })
    const store = useP2pTransferStore()
    await store.restoreAccount('account')
    const socket = new FakeSocket()
    store.attachSocket(socket as never)
    await store.resumeTransfer('reconnect')
    disconnected = true
    socket.connection(false)
    socket.connection(true)
    await vi.waitFor(() => expect(window.imDesktop!.suspendP2pReceive).toHaveBeenCalled())
    expect(events).toEqual(['restored'])
    release()
    await vi.waitFor(() => expect(socket.sent.filter((call) => call.cmd === 'P2P_TRANSFER_REQUEST')).toHaveLength(2))
    expect(events).toEqual(['restored', 'suspended', 'restored'])
    await store.dispose()
  })
})
