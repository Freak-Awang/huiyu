import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocketManager } from './websocket'

class FakeWebSocket {
  static OPEN = 1
  static CONNECTING = 0
  static instances: FakeWebSocket[] = []
  readyState = FakeWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((event: Event) => void) | null = null
  sent: string[] = []
  url: string

  constructor(url: string) { this.url = url; FakeWebSocket.instances.push(this) }
  send(payload: string) { this.sent.push(payload) }
  open() { this.readyState = FakeWebSocket.OPEN; this.onopen?.() }
  receive(payload: unknown) { this.onmessage?.({ data: JSON.stringify(payload) }) }
  close() { this.readyState = 3; this.onclose?.() }
}

describe('WebSocketManager request protocol', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.stubGlobal('localStorage', { getItem: () => null })
    vi.stubGlobal('window', {
      location: { protocol: 'http:', host: 'localhost:5173' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('matches a response by seq while still publishing command subscriptions', async () => {
    const fallbackHandler = vi.fn()
    const subscriber = vi.fn()
    const manager = new WebSocketManager(async () => 'ticket', fallbackHandler)
    manager.subscribe('P2P_PEER_STATUS', subscriber)
    manager.connect()
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    const socket = FakeWebSocket.instances[0]
    socket.open()

    const pending = manager.request<{ available: boolean }>('P2P_PEER_STATUS', { conversationId: '7' })
    const request = JSON.parse(socket.sent.at(-1)!)
    socket.receive({ cmd: 'P2P_PEER_STATUS', seq: String(request.seq), data: { ok: true, available: true } })

    await expect(pending).resolves.toEqual({ ok: true, available: true })
    expect(subscriber).toHaveBeenCalledOnce()
    expect(fallbackHandler).toHaveBeenCalledOnce()
    manager.disconnect()
  })

  it('rejects a failed server response with its result code', async () => {
    const manager = new WebSocketManager(async () => 'ticket', vi.fn())
    manager.connect()
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    const socket = FakeWebSocket.instances[0]
    socket.open()

    const pending = manager.request('P2P_TRANSFER_REQUEST', { transferId: 'p2p_missing' })
    const request = JSON.parse(socket.sent.at(-1)!)
    socket.receive({
      cmd: 'P2P_TRANSFER_REQUEST',
      seq: request.seq,
      data: { ok: false, code: 410, message: 'source unavailable' },
    })

    await expect(pending).rejects.toMatchObject({ message: 'source unavailable', code: 410 })
    manager.disconnect()
  })
})
