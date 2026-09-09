import { createPinia, setActivePinia } from 'pinia'
import { useP2pTransferStore } from '../app/im-web/src/stores/p2pTransfers'

declare const window: Window & {
  p2pE2EBridge: {
    request(command: string, data: unknown): Promise<unknown>
    send(command: string, data: unknown): void
    onSignal(handler: (message: any) => void): () => void
  }
  p2pE2E: Record<string, any>
}

const transport = { peerConnections: 0, binaryBytesReceived: 0, relayServersConfigured: 0 }
const NativePeerConnection = window.RTCPeerConnection
window.RTCPeerConnection = class extends NativePeerConnection {
  constructor(configuration?: RTCConfiguration) {
    if (configuration?.iceServers?.length) transport.relayServersConfigured += configuration.iceServers.length
    super(configuration)
    transport.peerConnections++
    this.addEventListener('datachannel', (event) => {
      event.channel.addEventListener('message', (message) => {
        if (message.data instanceof ArrayBuffer) transport.binaryBytesReceived += message.data.byteLength
        else if (message.data instanceof Blob) transport.binaryBytesReceived += message.data.size
      })
    })
  }
}

setActivePinia(createPinia())
const store = useP2pTransferStore()
const handlers = new Map<string, Set<(message: any) => void>>()
const states = new Set<(connected: boolean) => void>()
let connected = false
const wire = (data: unknown) => JSON.parse(JSON.stringify(data))
const socket = {
  isConnected: () => connected,
  request: (command: string, data: unknown) => connected
    ? window.p2pE2EBridge.request(command, wire(data)) : Promise.reject(new Error('Signaling is disconnected')),
  send: (command: string, data: unknown) => {
    if (!connected) return false
    window.p2pE2EBridge.send(command, wire(data)); return true
  },
  subscribe(command: string, handler: (message: any) => void) {
    if (!handlers.has(command)) handlers.set(command, new Set())
    handlers.get(command)!.add(handler)
    return () => handlers.get(command)?.delete(handler)
  },
  onConnectionChange(handler: (value: boolean) => void) { states.add(handler); return () => states.delete(handler) },
}
window.p2pE2EBridge.onSignal((message) => { for (const handler of handlers.get(message.cmd) || []) handler(message) })

window.p2pE2E = {
  async start(accountId: string) {
    await store.restoreAccount(accountId)
    connected = true
    store.attachSocket(socket as any)
    await store.refreshPeerStatus('20')
    return { desktop: store.desktopSupported, enabled: store.serverEnabled }
  },
  async offerFromPicker(kind: 'file' | 'folder') {
    const desktop = window.imDesktop as any
    const selection = await desktop.pickP2pSources(kind)
    const source = Array.isArray(selection) ? selection[0] : selection.sources?.[0]
    if (!source?.sourceId) throw new Error(`Source picker did not return a source: ${JSON.stringify(selection)}`)
    const response = await store.createOffer({
      id: crypto.randomUUID(), conversationId: '20', kind: source.kind, name: source.name,
      size: source.totalSize, nativeSource: source, status: 'waiting', progress: 0,
      mimeType: '', lastModified: 0,
    } as any, '20')
    return { ...response, attachment: JSON.parse(response.content) }
  },
  receive: (content: any, messageId: string) => store.receiveAttachment(content, { messageId, conversationId: '20' }),
  pause: (id: string) => store.pauseTransfer(id),
  resume: (id: string) => store.resumeTransfer(id),
  cancel: (id: string) => store.cancelTransfer(id),
  stop: (id: string) => store.stopSharing(id),
  again: (id: string) => store.receiveAgain(id),
  snapshot: () => JSON.parse(JSON.stringify({ states: store.states, tasks: store.tasks, transport })),
  nativeTasks: () => (window.imDesktop as any).listP2pTasks(),
  async dispose() { connected = false; await store.dispose() },
  setConnected(value: boolean) { connected = value; for (const handler of states) handler(value) },
}
