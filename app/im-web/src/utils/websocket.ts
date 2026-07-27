// Intent: websocket isolates reusable client-side behavior from Vue components.
import { getWsBaseUrl } from '../config/runtime'

export interface WsMessage {
  cmd: string
  seq: number
  data: any
}

type MessageHandler = (msg: WsMessage) => void
type ConnectionHandler = (connected: boolean) => void
type TicketProvider = () => Promise<string>

export class WebSocketManager {
  private ws: WebSocket | null = null
  private readonly ticketProvider: TicketProvider
  private readonly messageHandler: MessageHandler
  private readonly connectionHandler?: ConnectionHandler
  private seqCounter = 0
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private pongTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectCount = 0
  private readonly reconnectBaseDelay = 1000
  private readonly reconnectMaxDelay = 30000
  private intentionalClose = false
  private generation = 0

  constructor(ticketProvider: TicketProvider, handler: MessageHandler, connectionHandler?: ConnectionHandler) {
    this.ticketProvider = ticketProvider
    this.messageHandler = handler
    this.connectionHandler = connectionHandler
  }

  connect() {
    this.intentionalClose = false
    this.reconnectCount = 0
    this.generation++
    window.addEventListener('online', this.handleNetworkOnline)
    void this.doConnect(this.generation)
  }

  private async doConnect(generation: number) {
    if (this.intentionalClose || generation !== this.generation) return
    this.clearReconnectTimer()
    this.disposeSocket()

    try {
      const ticket = await this.ticketProvider()
      if (this.intentionalClose || generation !== this.generation) return
      const separator = getWsBaseUrl().includes('?') ? '&' : '?'
      const url = `${getWsBaseUrl()}${separator}ticket=${encodeURIComponent(ticket)}`
      const socket = new WebSocket(url)
      this.ws = socket

      socket.onopen = () => {
        if (socket !== this.ws) return
        this.reconnectCount = 0
        this.connectionHandler?.(true)
        this.startHeartbeat()
      }

      socket.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data)
          if (msg.cmd === 'PONG') {
            this.clearPongTimer()
          }
          this.messageHandler(msg)
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e)
        }
      }

      socket.onclose = () => {
        if (socket !== this.ws) return
        this.ws = null
        this.stopHeartbeat()
        this.connectionHandler?.(false)
        if (!this.intentionalClose) this.scheduleReconnect()
      }

      socket.onerror = (err) => {
        if (socket !== this.ws) return
        this.connectionHandler?.(false)
        console.error('WebSocket error:', err)
      }
    } catch (error) {
      console.error('Failed to obtain WebSocket ticket:', error)
      this.connectionHandler?.(false)
      if (!this.intentionalClose) this.scheduleReconnect()
    }
  }

  disconnect() {
    this.intentionalClose = true
    this.generation++
    window.removeEventListener('online', this.handleNetworkOnline)
    this.stopHeartbeat()
    this.clearReconnectTimer()
    this.disposeSocket()
    this.connectionHandler?.(false)
  }

  send(cmd: string, data: any): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    const seq = ++this.seqCounter
    this.ws.send(JSON.stringify({ cmd, seq, data }))
    return true
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (!this.send('PING', {})) return
      this.clearPongTimer()
      this.pongTimer = setTimeout(() => {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.close()
      }, 10000)
    }, 30000)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    this.clearPongTimer()
  }

  private clearPongTimer() {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer)
      this.pongTimer = null
    }
  }

  private scheduleReconnect() {
    if (this.intentionalClose || this.reconnectTimer) return
    const exponential = Math.min(
      this.reconnectMaxDelay,
      this.reconnectBaseDelay * 2 ** Math.min(this.reconnectCount, 5),
    )
    const delay = Math.round(exponential * (0.75 + Math.random() * 0.5))
    this.reconnectCount++
    const generation = this.generation
    this.reconnectTimer = setTimeout(() => void this.doConnect(generation), delay)
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private disposeSocket() {
    if (!this.ws) return
    const socket = this.ws
    this.ws = null
    socket.onopen = null
    socket.onmessage = null
    socket.onclose = null
    socket.onerror = null
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close()
    }
  }

  private handleNetworkOnline = () => {
    if (this.intentionalClose || this.isConnected()) return
    this.clearReconnectTimer()
    void this.doConnect(this.generation)
  }
}
