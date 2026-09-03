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

type WsHandler = (message: WsMessage) => void

class FakeSocket {
  handlers = new Map<string, Set<WsHandler>>()
  offerCount = 0
  sent: Array<{ cmd: string; data: any }> = []

  isConnected() { return true }

  async request(cmd: string, data: any) {
    if (cmd === 'CLIENT_CAPABILITIES') return { enabled: true, p2pFileVersion: 1 }
    if (cmd === 'P2P_PEER_STATUS') return { available: true }
    if (cmd === 'P2P_OFFER_CREATE') {
      this.offerCount += 1
      const transferId = `p2p_${this.offerCount}`
      return {
        transferId,
        messageId: String(this.offerCount),
        conversationId: String(data.conversationId),
        messageType: 'FILE',
        content: JSON.stringify({ transferMode: 'p2p_lan', transferId }),
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

  onConnectionChange() { return () => undefined }

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
    store.dispose()
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
    store.dispose()
  })
})
