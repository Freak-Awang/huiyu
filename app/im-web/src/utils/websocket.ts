export interface WsMessage {
  cmd: string
  seq: number
  data: any
}

type MessageHandler = (msg: WsMessage) => void

export class WebSocketManager {
  private ws: WebSocket | null = null
  private token: string
  private messageHandler: MessageHandler
  private seqCounter = 0
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectCount = 0
  private maxReconnect = 5
  private reconnectDelay = 3000
  private intentionalClose = false

  constructor(token: string, handler: MessageHandler) {
    this.token = token
    this.messageHandler = handler
  }

  connect() {
    this.intentionalClose = false
    this.reconnectCount = 0
    this.doConnect()
  }

  private doConnect() {
    if (this.ws) {
      this.ws.close()
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const url = `${protocol}//${host}/ws/im?token=${encodeURIComponent(this.token)}`
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.reconnectCount = 0
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
      if (!this.intentionalClose) {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = (err) => {
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
  }

  send(cmd: string, data: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, cannot send:', cmd)
      return
    }
    const seq = ++this.seqCounter
    const payload = JSON.stringify({ cmd, seq, data })
    this.ws.send(payload)
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  private startHeartbeat() {
    this.stopHeartbeat()
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
    this.reconnectTimer = setTimeout(() => {
      this.doConnect()
    }, this.reconnectDelay)
  }
}
