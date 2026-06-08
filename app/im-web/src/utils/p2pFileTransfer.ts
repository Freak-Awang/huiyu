import type { FileTransfer } from '../api/file'
import type { WsMessage } from './websocket'

export interface P2pTransferProgress {
  name: string
  percent: number
  speed: number
  remainingSeconds: number
  phase: 'waiting' | 'p2p' | 'completed'
}

interface P2pManagerOptions {
  currentUserId: () => string | undefined
  sendWs: (cmd: string, data: any) => boolean
  onProgress?: (progress: P2pTransferProgress) => void
  onNotice?: (message: string) => void
}

interface P2pSession {
  transferId: string
  conversationId: string
  targetUserId: string
  fileName: string
  fileSize: number
  file?: File
  pc?: RTCPeerConnection
  channel?: RTCDataChannel
  resolve?: (value: boolean) => void
  reject?: (reason?: any) => void
  acceptTimer?: ReturnType<typeof setTimeout>
  startedAt: number
  receivedBytes: number
  chunks: BlobPart[]
  writable?: FileSystemWritableFileStream
}

type FileSystemWritableFileStream = {
  write: (data: BlobPart) => Promise<void>
  close: () => Promise<void>
}

const CHUNK_SIZE = 256 * 1024
const MAX_BUFFERED_AMOUNT = 4 * 1024 * 1024
const ACCEPT_TIMEOUT_MS = 30000

export class P2pFileTransferError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'P2pFileTransferError'
  }
}

export class P2pFileTransferManager {
  private sessions = new Map<string, P2pSession>()
  private options: P2pManagerOptions

  constructor(options: P2pManagerOptions) {
    this.options = options
  }

  startSender(file: File, transfer: FileTransfer, conversationId: string, targetUserId: string): Promise<boolean> {
    if (!window.RTCPeerConnection) {
      return Promise.reject(new P2pFileTransferError('WebRTC is not available'))
    }
    const transferId = transfer.transferId
    const session: P2pSession = {
      transferId,
      conversationId,
      targetUserId,
      fileName: file.name,
      fileSize: file.size,
      file,
      startedAt: Date.now(),
      receivedBytes: 0,
      chunks: [],
    }
    this.sessions.set(transferId, session)
    this.options.onProgress?.(this.progressSnapshot(session, 0, 'waiting'))

    return new Promise((resolve, reject) => {
      session.resolve = resolve
      session.reject = reject
      session.acceptTimer = setTimeout(() => {
        this.failSession(session, 'p2p accept timeout')
      }, ACCEPT_TIMEOUT_MS)
      this.send('FILE_P2P_INVITE', session, {
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type,
        sha256: transfer.sha256,
      })
    })
  }

  handleMessage(msg: WsMessage): boolean {
    if (!msg.cmd.startsWith('FILE_P2P_')) return false
    const data = msg.data || {}
    const transferId = String(data.transferId || '')
    if (!transferId) return true

    switch (msg.cmd) {
      case 'FILE_P2P_INVITE':
        void this.handleInvite(data)
        break
      case 'FILE_P2P_ACCEPT':
        void this.handleAccept(data)
        break
      case 'FILE_P2P_REJECT':
        this.handleReject(data)
        break
      case 'FILE_P2P_SIGNAL':
        void this.handleSignal(data)
        break
      case 'FILE_P2P_COMPLETE':
        this.handleComplete(data)
        break
      case 'FILE_P2P_FAILED':
        this.handleFailed(data)
        break
      default:
        break
    }
    return true
  }

  abortAll() {
    for (const session of this.sessions.values()) {
      this.closeSession(session)
    }
    this.sessions.clear()
  }

  private async handleInvite(data: any) {
    const senderId = String(data.senderId || '')
    const transferId = String(data.transferId || '')
    const conversationId = String(data.conversationId || '')
    if (!senderId || !transferId || !conversationId) return

    const fileName = String(data.fileName || 'file')
    const fileSize = Number(data.fileSize || 0)
    const accepted = window.confirm(`Accept P2P file transfer?\n${fileName}\n${formatSize(fileSize)}`)
    const session: P2pSession = {
      transferId,
      conversationId,
      targetUserId: senderId,
      fileName,
      fileSize,
      startedAt: Date.now(),
      receivedBytes: 0,
      chunks: [],
    }
    if (!accepted) {
      this.send('FILE_P2P_REJECT', session, { reason: 'receiver rejected' })
      return
    }

    this.sessions.set(transferId, session)
    await this.prepareReceiver(session)
    this.send('FILE_P2P_ACCEPT', session, {})
  }

  private async handleAccept(data: any) {
    const session = this.sessions.get(String(data.transferId || ''))
    if (!session || !session.file) return
    if (session.acceptTimer) {
      clearTimeout(session.acceptTimer)
      session.acceptTimer = undefined
    }
    await this.prepareSender(session)
  }

  private handleReject(data: any) {
    const session = this.sessions.get(String(data.transferId || ''))
    if (!session) return
    this.failSession(session, data.reason || 'receiver rejected')
  }

  private async handleSignal(data: any) {
    const session = this.sessions.get(String(data.transferId || ''))
    if (!session?.pc) return
    const signalType = String(data.signalType || '')
    if (signalType === 'offer' && data.sdp) {
      await session.pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
      const answer = await session.pc.createAnswer()
      await session.pc.setLocalDescription(answer)
      this.send('FILE_P2P_SIGNAL', session, { signalType: 'answer', sdp: answer })
      return
    }
    if (signalType === 'answer' && data.sdp) {
      await session.pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
      return
    }
    if (signalType === 'ice' && data.candidate) {
      await session.pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => undefined)
    }
  }

  private handleComplete(data: any) {
    const session = this.sessions.get(String(data.transferId || ''))
    if (!session) return
    session.resolve?.(true)
    this.options.onProgress?.(this.progressSnapshot(session, session.fileSize, 'completed'))
    this.closeSession(session)
    this.sessions.delete(session.transferId)
  }

  private handleFailed(data: any) {
    const session = this.sessions.get(String(data.transferId || ''))
    if (!session) return
    this.failSession(session, data.reason || 'p2p failed')
  }

  private async prepareSender(session: P2pSession) {
    const pc = this.createPeer(session)
    const channel = pc.createDataChannel('file')
    channel.binaryType = 'arraybuffer'
    session.pc = pc
    session.channel = channel
    channel.onopen = () => {
      void this.sendFileChunks(session)
    }
    channel.onerror = () => this.failSession(session, 'data channel error')

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    this.send('FILE_P2P_SIGNAL', session, { signalType: 'offer', sdp: offer })
  }

  private async prepareReceiver(session: P2pSession) {
    const pc = this.createPeer(session)
    session.pc = pc
    pc.ondatachannel = (event) => {
      session.channel = event.channel
      session.channel.binaryType = 'arraybuffer'
      session.channel.onmessage = (message) => {
        void this.handleReceiverData(session, message.data)
      }
      session.channel.onerror = () => this.failSession(session, 'data channel error')
    }
  }

  private createPeer(session: P2pSession) {
    const pc = new RTCPeerConnection({ iceServers: [] })
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.send('FILE_P2P_SIGNAL', session, { signalType: 'ice', candidate: event.candidate })
      }
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.failSession(session, `webrtc ${pc.connectionState}`)
      }
    }
    return pc
  }

  private async sendFileChunks(session: P2pSession) {
    if (!session.file || !session.channel) return
    const channel = session.channel
    try {
      channel.send(JSON.stringify({ type: 'file-start', fileName: session.fileName, fileSize: session.fileSize }))
      let offset = 0
      while (offset < session.file.size) {
        await this.waitForBufferedAmount(channel)
        const end = Math.min(offset + CHUNK_SIZE, session.file.size)
        channel.send(await session.file.slice(offset, end).arrayBuffer())
        offset = end
        this.options.onProgress?.(this.progressSnapshot(session, offset, 'p2p'))
        this.send('FILE_P2P_PROGRESS', session, { loaded: offset, total: session.file.size })
      }
      channel.send(JSON.stringify({ type: 'file-end' }))
    } catch (error: any) {
      this.send('FILE_P2P_FAILED', session, { reason: error?.message || 'p2p send failed' })
      this.failSession(session, error?.message || 'p2p send failed')
    }
  }

  private async handleReceiverData(session: P2pSession, data: any) {
    if (typeof data === 'string') {
      const message = JSON.parse(data)
      if (message.type === 'file-start') {
        await this.openReceiverSink(session)
        this.options.onProgress?.(this.progressSnapshot(session, 0, 'p2p'))
      } else if (message.type === 'file-end') {
        await this.finishReceiverSink(session)
        this.send('FILE_P2P_COMPLETE', session, {})
        this.options.onNotice?.(`P2P file received: ${session.fileName}`)
        this.closeSession(session)
        this.sessions.delete(session.transferId)
      }
      return
    }

    const chunk = data instanceof Blob ? data : new Blob([data])
    if (session.writable) {
      await session.writable.write(chunk)
    } else {
      session.chunks.push(chunk)
    }
    session.receivedBytes += chunk.size
    this.options.onProgress?.(this.progressSnapshot(session, session.receivedBytes, 'p2p'))
    this.send('FILE_P2P_PROGRESS', session, { loaded: session.receivedBytes, total: session.fileSize })
  }

  private async openReceiverSink(session: P2pSession) {
    const picker = (window as any).showSaveFilePicker
    if (!picker) return
    try {
      const handle = await picker({
        suggestedName: session.fileName,
      })
      session.writable = await handle.createWritable()
    } catch {
      session.writable = undefined
    }
  }

  private async finishReceiverSink(session: P2pSession) {
    if (session.writable) {
      await session.writable.close()
      session.writable = undefined
      return
    }
    const blob = new Blob(session.chunks)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = session.fileName
    anchor.click()
    URL.revokeObjectURL(url)
    session.chunks = []
  }

  private waitForBufferedAmount(channel: RTCDataChannel) {
    if (channel.bufferedAmount < MAX_BUFFERED_AMOUNT) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      channel.bufferedAmountLowThreshold = MAX_BUFFERED_AMOUNT / 2
      channel.onbufferedamountlow = () => {
        channel.onbufferedamountlow = null
        resolve()
      }
    })
  }

  private failSession(session: P2pSession, reason: string) {
    if (session.acceptTimer) {
      clearTimeout(session.acceptTimer)
    }
    session.reject?.(new P2pFileTransferError(reason))
    this.closeSession(session)
    this.sessions.delete(session.transferId)
  }

  private closeSession(session: P2pSession) {
    session.channel?.close()
    session.pc?.close()
    if (session.writable) {
      void session.writable.close().catch(() => undefined)
      session.writable = undefined
    }
  }

  private send(cmd: string, session: P2pSession, data: any) {
    this.options.sendWs(cmd, {
      ...data,
      transferId: session.transferId,
      conversationId: session.conversationId,
      targetUserId: session.targetUserId,
    })
  }

  private progressSnapshot(session: P2pSession, loaded: number, phase: P2pTransferProgress['phase']) {
    const elapsedSeconds = Math.max(0.001, (Date.now() - session.startedAt) / 1000)
    const speed = loaded / elapsedSeconds
    return {
      name: session.fileName,
      percent: session.fileSize > 0 ? Math.min(100, Math.round((loaded / session.fileSize) * 100)) : 0,
      speed,
      remainingSeconds: speed > 0 ? Math.max(0, (session.fileSize - loaded) / speed) : 0,
      phase,
    }
  }
}

function formatSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = size
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return unit === 0 ? `${value}${units[unit]}` : `${value.toFixed(1)}${units[unit]}`
}
