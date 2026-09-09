import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMessageSender } from './messageSender'
import { WebSocketManager } from './websocket'
import type { Message } from '../api/message'

class Socket {
  static OPEN = 1
  static latest: Socket
  readyState = 1
  onopen?: () => void
  onmessage?: (event: { data: string }) => void
  onclose?: () => void
  sent: Array<{ seq: number; cmd: string; data: any }> = []
  constructor() { Socket.latest = this }
  send(payload: string) { this.sent.push(JSON.parse(payload)) }
  close() { this.readyState = 3; this.onclose?.() }
  reply(data: unknown, seq = this.sent.at(-1)!.seq) { this.onmessage?.({ data: JSON.stringify({ cmd: 'MESSAGE_ACK', seq, data }) }) }
}

const managers: WebSocketManager[] = []
async function setup() {
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', Socket)
  vi.stubGlobal('localStorage', { getItem: () => null })
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
  const update = vi.fn()
  const status = vi.fn()
  const manager = new WebSocketManager(async () => 'ticket', vi.fn())
  managers.push(manager)
  await manager.connect()
  Socket.latest.onopen?.()
  const sender = createMessageSender(update, status)
  const message = { clientMsgId: 'same-id', conversationId: 'one', messageType: 'TEXT', content: 'hello' } as Message
  return { sender, update, status, manager, socket: Socket.latest, message }
}
afterEach(() => {
  managers.splice(0).forEach((manager) => manager.disconnect())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('message send confirmation', () => {
  it('times out and retries with the same id, then accepts the confirmed server id', async () => {
    const { sender, update, status, manager, socket, message } = await setup()
    sender.send(manager, message)
    await vi.advanceTimersByTimeAsync(15000)
    expect(status).toHaveBeenLastCalledWith('same-id', 'FAILED')
    sender.send(manager, message)
    expect(socket.sent.filter((item) => item.cmd === 'MESSAGE_SEND').map((item) => item.data.clientMsgId)).toEqual(['same-id', 'same-id'])
    socket.reply({ messageId: '501', status: 'SENT' })
    await vi.advanceTimersByTimeAsync(0)
    expect(update).toHaveBeenLastCalledWith('same-id', '501', 'SENT')
  })
  it('shows a server rejection as failed immediately', async () => {
    const { sender, status, manager, socket, message } = await setup()
    sender.send(manager, message)
    socket.reply({ ok: false, code: 403, message: 'not a member' })
    await vi.advanceTimersByTimeAsync(0)
    expect(status).toHaveBeenLastCalledWith('same-id', 'FAILED')
  })
  it('fails pending sends on disconnect, and ignores an older attempt after a retry', async () => {
    const { sender, update, status, manager, socket, message } = await setup()
    sender.send(manager, message)
    const older = socket.sent.at(-1)!.seq
    sender.send(manager, message)
    socket.reply({ ok: false }, older)
    await vi.advanceTimersByTimeAsync(0)
    expect(status).not.toHaveBeenCalledWith('same-id', 'FAILED')
    socket.close()
    await vi.advanceTimersByTimeAsync(0)
    expect(status).toHaveBeenLastCalledWith('same-id', 'FAILED')
    expect(update).not.toHaveBeenCalled()
  })
  it('prevents pending callbacks from changing another account after disposal', async () => {
    const { sender, update, manager, socket, message } = await setup()
    sender.send(manager, message)
    sender.dispose()
    socket.reply({ messageId: '501', status: 'SENT' })
    await vi.advanceTimersByTimeAsync(0)
    expect(update).not.toHaveBeenCalled()
  })
})
