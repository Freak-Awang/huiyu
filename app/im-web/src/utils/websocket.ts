// ?????websocket isolates reusable client-side behavior from Vue components.
import { getWsBaseUrl } from '../config/runtime'

export interface WsMessage {
  cmd: string
  seq: number
  data: any
}

type MessageHandler = (msg: WsMessage) => void
type ConnectionHandler = (connected: boolean) => void

export class WebSocketManager {
  private ws: WebSocket | null = null
  private token: string
  private messageHandler: MessageHandler
  private connectionHandler?: ConnectionHandler
  private seqCounter = 0
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectCount = 0
  private maxReconnect = 5
  private reconnectDelay = 3000
  private intentionalClose = false

  constructor(token: string, handler: MessageHandler, connectionHandler?: ConnectionHandler) {
    this.token = token
    this.messageHandler = handler
    this.connectionHandler = connectionHandler
  }

  connect() {
    // A fresh manual connect resets retry state; automatic reconnects go through scheduleReconnect instead.
    this.intentionalClose = false
    this.reconnectCount = 0
    this.doConnect()
  }

  private doConnect() {
    if (this.ws) {
      this.ws.close()
    }

    const url = `${getWsBaseUrl()}?token=${encodeURIComponent(this.token)}`
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.reconnectCount = 0
      this.connectionHandler?.(true)
      this.startHeartbeat()
    }

    this.ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data)
        this.messageHandler(msg)
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }

    this.ws.onclose = () => {
      this.stopHeartbeat()
      this.connectionHandler?.(false)
      if (!this.intentionalClose) {
        // Network drops should retry, while explicit logout/navigation disconnects must stay closed.
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = (err) => {
      this.connectionHandler?.(false)
      console.error('WebSocket error:', err)
    }
  }

  disconnect() {
    this.intentionalClose = true
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.connectionHandler?.(false)
  }

  send(cmd: string, data: any): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, cannot send:', cmd)
      return false
    }
    const seq = ++this.seqCounter
    // seq lets the backend ACK map a response back to the optimistic client action.
    const payload = JSON.stringify({ cmd, seq, data })
    this.ws.send(payload)
    return true
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    // Heartbeat keeps proxies and the backend aware of an active desktop/browser session.
    this.heartbeatTimer = setInterval(() => {
      this.send('PING', {})
    }, 30000)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private scheduleReconnect() {
    if (this.reconnectCount >= this.maxReconnect) {
      console.warn('Max reconnect attempts reached')
      return
    }
    this.reconnectCount++
    // Fixed-delay reconnect is intentionally simple; pending messages are recovered through backend delivery rows.
    this.reconnectTimer = setTimeout(() => {
      this.doConnect()
    }, this.reconnectDelay)
  }
}
