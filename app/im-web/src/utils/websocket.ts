/**
 * WebSocket 连接管理器
 *
 * 企业 IM 的实时消息通道，管理 WebSocket 连接全生命周期：
 * - 连接建立：通过 ticket 认证建立 WebSocket 连接
 * - 心跳保活：每 30 秒发送 PING，10 秒内未收到 PONG 则断开重连
 * - 断线重连：指数退避 + 随机抖动（1s/2s/4s/8s/16s/30s 上限），避免惊群效应
 * - 网络恢复：监听 online 事件自动重连
 * - 代际隔离（generation）：每次 connect/disconnect 递增，防止旧连接的 stale 回调污染当前状态
 */
import { getWsBaseUrl } from '../config/runtime'

export interface WsMessage {
  cmd: string
  seq: number
  data: any
}

type MessageHandler = (msg: WsMessage) => void
type ConnectionHandler = (connected: boolean) => void
type TicketProvider = () => Promise<string>

interface PendingRequest {
  resolve: (data: any) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

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
  private readonly reconnectBaseDelay = 1000    // 重连基础延迟 1 秒
  private readonly reconnectMaxDelay = 30000    // 重连最大延迟 30 秒
  private intentionalClose = false              // 是否主动断开（主动断开不重连）
  private generation = 0                        // 连接代际，防止过期连接回调
  private readonly subscribers = new Map<string, Set<MessageHandler>>()
  private readonly connectionSubscribers = new Set<ConnectionHandler>()
  private readonly pendingRequests = new Map<number, PendingRequest>()

  /**
   * @param ticketProvider - 异步获取认证 ticket 的函数
   * @param handler - 消息处理回调
   * @param connectionHandler - 连接状态变化回调（可选）
   */
  constructor(ticketProvider: TicketProvider, handler: MessageHandler, connectionHandler?: ConnectionHandler) {
    this.ticketProvider = ticketProvider
    this.messageHandler = handler
    this.connectionHandler = connectionHandler
  }

  /** 建立连接 */
  connect() {
    this.intentionalClose = false
    this.reconnectCount = 0
    this.generation++
    window.addEventListener('online', this.handleNetworkOnline)
    void this.doConnect(this.generation)
  }

  /**
   * 执行连接
   * @param generation - 当前连接代际，用于防止过期连接的回调污染
   */
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
        if (socket !== this.ws) return // 代际检查：忽略过期 socket
        this.reconnectCount = 0
        this.connectionHandler?.(true)
        this.connectionSubscribers.forEach((handler) => handler(true))
        this.startHeartbeat()
      }

      socket.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data)
          if (msg.cmd === 'PONG') {
            this.clearPongTimer()
          }
          const pending = this.pendingRequests.get(Number(msg.seq))
          if (pending) {
            globalThis.clearTimeout(pending.timer)
            this.pendingRequests.delete(Number(msg.seq))
            if (msg.data?.ok === false) {
              const error = new Error(msg.data.message || '请求失败') as Error & { code?: number }
              error.code = Number(msg.data.code || 0)
              pending.reject(error)
            } else {
              pending.resolve(msg.data)
            }
          }
          this.subscribers.get(msg.cmd)?.forEach((handler) => handler(msg))
          this.messageHandler(msg)
        } catch (e) {
          console.error('WebSocket 消息解析失败:', e)
        }
      }

      socket.onclose = () => {
        if (socket !== this.ws) return
        this.ws = null
        this.stopHeartbeat()
        this.connectionHandler?.(false)
        this.connectionSubscribers.forEach((handler) => handler(false))
        this.rejectPendingRequests(new Error('WebSocket 已断开'))
        if (!this.intentionalClose) this.scheduleReconnect()
      }

      socket.onerror = (err) => {
        if (socket !== this.ws) return
        this.connectionHandler?.(false)
        console.error('WebSocket 错误:', err)
      }
    } catch (error) {
      console.error('获取 WebSocket ticket 失败:', error)
      this.connectionHandler?.(false)
      if (!this.intentionalClose) this.scheduleReconnect()
    }
  }

  /** 主动断开连接，不触发重连 */
  disconnect() {
    this.intentionalClose = true
    this.generation++
    window.removeEventListener('online', this.handleNetworkOnline)
    this.stopHeartbeat()
    this.clearReconnectTimer()
    this.disposeSocket()
    this.connectionHandler?.(false)
    this.connectionSubscribers.forEach((handler) => handler(false))
    this.rejectPendingRequests(new Error('WebSocket 已关闭'))
  }

  /**
   * 发送消息
   * @param cmd - 消息命令
   * @param data - 消息数据
   * @returns 是否发送成功
   */
  send(cmd: string, data: any): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    const seq = ++this.seqCounter
    this.ws.send(JSON.stringify({ cmd, seq, data }))
    return true
  }

  /** 发送带 seq 的请求，并等待服务端返回同 seq 响应。 */
  request<T = any>(cmd: string, data: any, timeoutMs = 15000): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket 未连接'))
    }
    const seq = ++this.seqCounter
    return new Promise<T>((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        this.pendingRequests.delete(seq)
        reject(new Error(`${cmd} 请求超时`))
      }, timeoutMs)
      this.pendingRequests.set(seq, { resolve, reject, timer })
      try {
        this.ws!.send(JSON.stringify({ cmd, seq, data }))
      } catch (error) {
        globalThis.clearTimeout(timer)
        this.pendingRequests.delete(seq)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  /** 订阅指定命令；返回取消订阅函数。 */
  subscribe(cmd: string, handler: MessageHandler) {
    const handlers = this.subscribers.get(cmd) || new Set<MessageHandler>()
    handlers.add(handler)
    this.subscribers.set(cmd, handlers)
    return () => {
      handlers.delete(handler)
      if (!handlers.size) this.subscribers.delete(cmd)
    }
  }

  /** 订阅连接状态变化；返回取消订阅函数。 */
  onConnectionChange(handler: ConnectionHandler) {
    this.connectionSubscribers.add(handler)
    return () => this.connectionSubscribers.delete(handler)
  }

  /** 判断当前是否已连接 */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  /**
   * 启动心跳
   * 每 30 秒发送 PING，等待 PONG 最多 10 秒
   * 超时未收到 PONG 则主动关闭连接，触发重连
   */
  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (!this.send('PING', {})) return
      this.clearPongTimer()
      this.pongTimer = setTimeout(() => {
        // PONG 超时，关闭连接触发重连
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

  /**
   * 调度断线重连
   * 指数退避 + 随机抖动：delay = base * 2^retryCount * random(0.75~1.25)
   * 最大 30 秒，避免大量客户端同时重连（惊群效应）
   */
  private scheduleReconnect() {
    if (this.intentionalClose || this.reconnectTimer) return
    const exponential = Math.min(
      this.reconnectMaxDelay,
      this.reconnectBaseDelay * 2 ** Math.min(this.reconnectCount, 5),
    )
    const delay = Math.round(exponential * (0.75 + Math.random() * 0.5)) // 随机抖动 75%-125%
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

  private rejectPendingRequests(error: Error) {
    for (const pending of this.pendingRequests.values()) {
      globalThis.clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pendingRequests.clear()
  }

  /** 释放当前 socket 连接，清理所有事件监听 */
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

  /** 网络恢复事件处理：非主动断开且未连接时立即重连 */
  private handleNetworkOnline = () => {
    if (this.intentionalClose || this.isConnected()) return
    this.clearReconnectTimer()
    void this.doConnect(this.generation)
  }
}
