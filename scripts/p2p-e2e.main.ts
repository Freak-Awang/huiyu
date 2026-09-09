import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { registerP2pHandlers } from '../app/im-web/electron/p2pNative'

const root = process.argv.find((arg) => arg.startsWith('--p2p-e2e-root='))?.slice('--p2p-e2e-root='.length)
if (!root || !path.isAbsolute(root)) throw new Error('A generated absolute E2E directory is required')
app.setPath('userData', path.join(root, 'electron-profile'))
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('in-process-gpu')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')

type Client = { id: number; label: string; account: string; window: BrowserWindow; version: number; picks: string[]; connected: boolean }
type Share = { transferId: string; messageId: string; content: any; sender: string; recipient: string; source?: Client; paused: boolean; state: string; revision: number }
type Route = { id: string; share: Share; source: Client; receiver: Client; ended?: string }
const clients = new Map<number, Client>()
const shares = new Map<string, Share>()
const routes = new Map<string, Route>()
const controlAudit: Record<string, number> = {}
const results: Array<{ scenario: string; elapsedMs: number; details?: unknown }> = []
const observations: Record<string, unknown> = {}
let native: ReturnType<typeof registerP2pHandlers> | undefined
let quitting = false

function send(client: Client, cmd: string, data: any) {
  if (client.connected && !client.window.isDestroyed()) client.window.webContents.send('p2p-e2e:signal', { cmd, data })
}
function accountClients(account: string) { return [...clients.values()].filter((client) => client.account === account && client.connected && !client.window.isDestroyed()) }
function claim(share: Share, claimed: boolean, except?: Client) {
  for (const client of accountClients(share.recipient)) if (client !== except) send(client, 'P2P_TRANSFER_CLAIMED', { transferId: share.transferId, claimed })
}
function authorizedShare(id: string, client: Client) {
  const share = shares.get(id)
  if (!share || ![share.sender, share.recipient].includes(client.account)) throw new Error('Unauthorized synthetic share')
  return share
}
function active(share: Share) { if (share.state !== 'ACTIVE') throw new Error(`SHARE_${share.state}`) }
function end(route: Route, reason: string, initiator?: Client) {
  if (route.ended) return { ok: true, alreadyEnded: true, reason: route.ended, routeId: route.id, transferId: route.share.transferId }
  route.ended = reason
  for (const peer of [route.source, route.receiver]) if (peer !== initiator) send(peer, 'P2P_TRANSFER_CANCEL', { routeId: route.id, transferId: route.share.transferId, reason })
  claim(route.share, false)
  return { ok: true, alreadyEnded: false, reason, routeId: route.id, transferId: route.share.transferId }
}
function stop(share: Share, state: string) {
  share.state = state; share.revision++; share.source = undefined
  for (const route of routes.values()) if (route.share === share && !route.ended) end(route, state === 'RECALLED' ? 'recalled' : 'source_stopped')
  for (const peer of [...accountClients(share.sender), ...accountClients(share.recipient)]) send(peer, 'P2P_SHARE_STATE', {
    transferId: share.transferId, messageId: share.messageId, shareState: state, revision: share.revision,
  })
}
function disconnectSignaling(client: Client) {
  client.connected = false
  for (const route of routes.values()) if (!route.ended && (route.source === client || route.receiver === client)) end(route, 'peer_disconnected', client)
  for (const share of shares.values()) if (share.source === client) share.source = undefined
}
function disconnect(client: Client) {
  disconnectSignaling(client)
  clients.delete(client.id)
}

const allowed: Record<string, string[]> = {
  CLIENT_CAPABILITIES: ['p2pFileVersion'], P2P_PEER_STATUS: ['conversationId'],
  P2P_OFFER_CREATE: ['version', 'conversationId', 'kind', 'name', 'totalSize', 'fileCount', 'directoryCount', 'sha256', 'manifestSha256', 'registrationId', 'clientMsgId'],
  P2P_SOURCE_REGISTER: ['version', 'messageId', 'transferId', 'kind', 'name', 'totalSize', 'fileCount', 'directoryCount', 'sha256', 'manifestSha256', 'registrationId', 'paused'],
  P2P_SHARE_STATUS: ['transferId'], P2P_TRANSFER_REQUEST: ['transferId'], P2P_SIGNAL: ['routeId', 'signal'],
  P2P_ROUTE_END: ['routeId', 'transferId', 'reason'], P2P_SHARE_STOP: ['transferId'],
}
function control(client: Client, command: string, data: any) {
  if (!client?.connected) throw new Error('Synthetic signaling session is disconnected')
  if (!allowed[command] || !data || Array.isArray(data) || Object.keys(data).some((key) => !allowed[command]!.includes(key))) {
    throw new Error(`Non-control data attempted through signaling: ${command}`)
  }
  controlAudit[command] = (controlAudit[command] || 0) + 1
  if (command === 'CLIENT_CAPABILITIES') { client.version = Math.min(2, data.p2pFileVersion); return { enabled: true, p2pFileVersion: client.version } }
  if (command === 'P2P_PEER_STATUS') return { available: accountClients(client.account === '100' ? '200' : '100').some((peer) => peer.version >= 2), p2pFileVersion: 2 }
  if (command === 'P2P_OFFER_CREATE') {
    if (data.version !== 2) throw new Error('All new offers must use protocol v2')
    const transferId = `p2p_${randomUUID().replaceAll('-', '')}`, messageId = String(shares.size + 1)
    const content = { ...data, transferId, transferMode: 'p2p_lan' }
    delete content.registrationId; delete content.clientMsgId; delete content.conversationId
    const share: Share = { transferId, messageId, content, sender: client.account, recipient: '200', source: client, paused: false, state: 'ACTIVE', revision: 1 }
    shares.set(transferId, share)
    return { ok: true, transferId, messageId, conversationId: '20', messageType: data.kind === 'file' ? 'FILE' : 'FOLDER',
      content: JSON.stringify(content), clientMsgId: data.clientMsgId, status: 'SENT', createdAt: new Date().toISOString() }
  }
  if (command === 'P2P_SIGNAL') {
    if (JSON.stringify(data.signal).length > 65536 || Object.keys(data.signal).length !== 1
      || !Object.keys(data.signal).every((key) => ['description', 'candidate', 'control'].includes(key))) throw new Error('Non-signaling payload')
    if (data.signal.control && data.signal.control.type !== 'queued') throw new Error('Only queue metadata can pass through signaling')
    const route = routes.get(data.routeId)
    if (!route || route.ended || ![route.source, route.receiver].includes(client)) return { ok: false }
    const peer = route.source === client ? route.receiver : route.source
    send(peer, 'P2P_SIGNAL', { transferId: route.share.transferId, routeId: route.id, signal: data.signal })
    return { ok: true }
  }
  const share = authorizedShare(data.transferId, client)
  if (command === 'P2P_SHARE_STOP') { if (share.sender !== client.account) throw new Error('Only sender can stop'); stop(share, 'STOPPED'); return { ok: true, shareState: share.state, revision: share.revision } }
  if (command === 'P2P_SHARE_STATUS') {
    const state = share.state !== 'ACTIVE' ? share.state.toLowerCase() : !share.source ? 'source_offline'
      : share.paused ? 'source_paused' : [...routes.values()].some((route) => route.share === share && !route.ended) ? 'source_busy' : 'available'
    return { ok: true, available: state === 'available', state, shareState: share.state, revision: share.revision, p2pFileVersion: 2 }
  }
  if (command === 'P2P_SOURCE_REGISTER') {
    active(share)
    if (client.account !== share.sender) throw new Error('Wrong source account')
    for (const field of ['version', 'sha256', 'manifestSha256', 'directoryCount']) {
      if (data[field] !== undefined && data[field] !== share.content[field]) throw new Error('SOURCE_CONTENT_CHANGED')
    }
    share.source = client; share.paused = !!data.paused
    for (const peer of accountClients(share.recipient)) send(peer, 'P2P_SHARE_STATE', { transferId: share.transferId,
      shareState: 'ACTIVE', revision: share.revision, state: share.paused ? 'source_paused' : 'available' })
    return { ok: true, transferId: share.transferId, shareState: 'ACTIVE', revision: share.revision }
  }
  if (command === 'P2P_ROUTE_END') {
    const route = routes.get(data.routeId)
    if (!route || route.share !== share) return { ok: true, alreadyEnded: true }
    return end(route, data.reason, client)
  }
  if (command === 'P2P_TRANSFER_REQUEST') {
    active(share)
    if (!share.source || share.paused || client.account !== share.recipient) throw new Error('Source unavailable')
    const current = [...routes.values()].find((route) => route.share === share && !route.ended)
    if (current && current.receiver !== client) throw new Error('Other device claimed this transfer')
    const route = current || { id: `route_${randomUUID()}`, source: share.source, receiver: client, share }
    routes.set(route.id, route)
    // ACK is queued before source signaling, matching the backend control lock ordering.
    setTimeout(() => { send(route.source, command, { transferId: share.transferId, routeId: route.id }); claim(share, true, client) }, 0)
    return { ok: true, transferId: share.transferId, routeId: route.id }
  }
  throw new Error(`Unhandled control command: ${command}`)
}

async function call(client: Client, method: string, ...args: any[]) {
  return client.window.webContents.executeJavaScript(`window.p2pE2E[${JSON.stringify(method)}](...${JSON.stringify(args)})`)
}
async function snapshot(client: Client, transferId: string) { return (await call(client, 'snapshot')).states[transferId] }
async function released(transferId: string) {
  const deadline = Date.now() + 5000
  while ([...routes.values()].some((route) => route.share.transferId === transferId && !route.ended)) {
    if (Date.now() > deadline) throw new Error('Completed/cancelled route did not release its device claim')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
async function until(client: Client, id: string, predicate: (state: any) => boolean, description: string, timeout = 45_000) {
  const deadline = Date.now() + timeout
  let state: any
  while (Date.now() < deadline) {
    state = await snapshot(client, id)
    if (predicate(state)) return state
    if (['failed', 'unavailable', 'stopped', 'recalled'].includes(state?.status)) throw new Error(`${description}: ${JSON.stringify(state)}`)
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`${description} timed out: ${JSON.stringify(state)}`)
}
async function newClient(label: string, account: string) {
  const window = new BrowserWindow({ show: false, webPreferences: { preload: path.join(root!, 'production-preload.cjs'),
    contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false, partition: `persist:p2p-e2e-${label}` } })
  const client: Client = { id: window.webContents.id, label, account, window, picks: [], version: 0, connected: true }
  clients.set(window.webContents.id, client)
  window.on('closed', () => { if (clients.has(client.id)) disconnect(client) })
  window.webContents.on('render-process-gone', (_event, details) => console.error(`[${label}] renderer exited: ${JSON.stringify(details)}`))
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 2) console.error(`[${label}] ${message}`) })
  await window.loadFile(path.join(root!, 'index.html'))
  const ready = await call(client, 'start', account)
  if (!ready.desktop || !ready.enabled) throw new Error(`Desktop P2P did not initialize: ${JSON.stringify(ready)}`)
  return client
}
async function closeClient(client: Client) {
  await call(client, 'dispose')
  disconnect(client)
  client.window.destroy()
}
async function tree(directory: string) {
  const result: Record<string, string> = {}
  async function walk(current: string, relative = '') {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const key = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) { result[`${key}/`] = 'directory'; await walk(path.join(current, entry.name), key) }
      else result[key] = createHash('sha256').update(await fs.readFile(path.join(current, entry.name))).digest('hex')
    }
  }
  await walk(directory)
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)))
}
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
async function scenario(name: string, body: () => Promise<any>) {
  const started = Date.now()
  const details = await body()
  results.push({ scenario: name, elapsedMs: Date.now() - started, details })
  console.log(`PASS ${name} (${Date.now() - started} ms)`)
}

async function run() {
  await app.whenReady()
  ipcMain.handle('p2p-e2e:request', (event, cmd, data) => control(clients.get(event.sender.id)!, cmd, data))
  ipcMain.on('p2p-e2e:send', (event, cmd, data) => {
    try { control(clients.get(event.sender.id)!, cmd, data) } catch (error) { console.error(error) }
  })
  ipcMain.handle('notification:show', () => true)
  const clientForDialog = (args: any[]) => [...clients.values()].find((client) => args[0] === client.window)
  dialog.showOpenDialog = (async (...args: any[]) => {
    const client = clientForDialog(args)
    if (!client) throw new Error('Dialog must be associated with its real BrowserWindow')
    const selected = client.picks.shift() || path.join(root!, 'received', client.label)
    if (!client.picks.length && selected.includes(`${path.sep}received${path.sep}`)) await fs.mkdir(selected, { recursive: true })
    return { canceled: false, filePaths: [selected] }
  }) as any
  dialog.showSaveDialog = (async (...args: any[]) => {
    const client = clientForDialog(args)
    if (!client) throw new Error('Save dialog must be associated with a BrowserWindow')
    const options = args.at(-1)
    const directory = path.join(root!, 'received', client.label)
    await fs.mkdir(directory, { recursive: true })
    return { canceled: false, filePath: path.join(directory, path.basename(options.defaultPath || 'received.bin')) }
  }) as any
  native = registerP2pHandlers({ assertTrusted: (event: any) => { if (!quitting && !clients.has(event.sender.id)) throw new Error('Untrusted renderer') },
    getWindow: (event: any) => clients.get(event.sender.id)?.window, getStorageDirectory: () => path.join(root!, 'received'),
    getClientRoot: (event: any) => path.join(root!, 'clients', clients.get(event.sender.id)!.label) })
  const sourceFolder = path.join(root!, 'source', 'complete-folder')
  await fs.mkdir(path.join(sourceFolder, 'empty-dir', 'nested'), { recursive: true })
  await fs.mkdir(path.join(sourceFolder, 'documents'), { recursive: true })
  await fs.writeFile(path.join(sourceFolder, 'empty.txt'), '')
  await fs.writeFile(path.join(sourceFolder, 'documents', 'hello.txt'), 'P2P 文件夹完整性：空文件与空目录都必须收到。\n')
  await fs.writeFile(path.join(sourceFolder, 'payload.bin'), Buffer.alloc(4 * 1024 * 1024, 0x5a))
  const largeFile = path.join(root!, 'source', 'resume.bin')
  await fs.writeFile(largeFile, Buffer.alloc(64 * 1024 * 1024, 0x7b))
  let sender = await newClient('sender', '100')
  let receiver = await newClient('receiver', '200')
  const otherDevice = await newClient('other-device', '200')
  let folderOffer: any
  await scenario('folder with empty file and empty directories is byte-for-byte complete', async () => {
    sender.picks.push(sourceFolder)
    folderOffer = await call(sender, 'offerFromPicker', 'folder')
    await call(receiver, 'receive', folderOffer.attachment, folderOffer.messageId)
    const done = await until(receiver, folderOffer.transferId, (state) => state?.status === 'completed', 'folder completion')
    const expected = await tree(sourceFolder), actual = await tree(done.localPath)
    assert(JSON.stringify(actual) === JSON.stringify(expected), `Folder differs: ${JSON.stringify({ expected, actual })}`)
    return { entries: Object.keys(actual).length, bytes: done.totalBytes }
  })
  await scenario('another device and the original device can receive the completed share again', async () => {
    await released(folderOffer.transferId)
    await call(otherDevice, 'receive', folderOffer.attachment, folderOffer.messageId)
    const second = await until(otherDevice, folderOffer.transferId, (state) => state?.status === 'completed', 'other device completion')
    assert(JSON.stringify(await tree(second.localPath)) === JSON.stringify(await tree(sourceFolder)), 'Second device content differs')
    await released(folderOffer.transferId)
    await call(receiver, 'again', folderOffer.transferId)
    const third = await until(receiver, folderOffer.transferId, (state) => state?.status === 'completed', 'repeat completion')
    return { otherDevicePath: second.localPath, repeatedPath: third.localPath }
  })
  await scenario('completed source survives restarted sender and shares the original content again', async () => {
    await released(folderOffer.transferId)
    await until(sender, folderOffer.transferId, (state) => state?.status === 'completed', 'sender completion')
    await closeClient(sender)
    sender = await newClient('sender', '100')
    const restored = await snapshot(sender, folderOffer.transferId)
    assert(restored?.status === 'completed', 'Completed source was not restored')
    await call(otherDevice, 'again', folderOffer.transferId)
    const done = await until(otherDevice, folderOffer.transferId, (state) => state?.status === 'completed', 'restored sender completion')
    assert(JSON.stringify(await tree(done.localPath)) === JSON.stringify(await tree(sourceFolder)), 'Restored sender content differs')
    return { restoredSourceStatus: restored.status, totalBytes: done.totalBytes }
  })
  await scenario('manual pause survives restarted renderer and resumes from retained disk bytes', async () => {
    sender.picks.push(largeFile)
    const offer = await call(sender, 'offerFromPicker', 'file')
    await call(receiver, 'receive', offer.attachment, offer.messageId)
    await until(receiver, offer.transferId, (state) => state?.transferredBytes > 0 && state.status !== 'completed', 'partial progress')
    await call(receiver, 'pause', offer.transferId)
    const before = await snapshot(receiver, offer.transferId)
    observations.pauseBeforeRestart = { renderer: before, native: await call(receiver, 'nativeTasks') }
    assert(before.status === 'paused', 'Pause did not take effect')
    await closeClient(receiver)
    receiver = await newClient('receiver', '200')
    const restored = await snapshot(receiver, offer.transferId)
    observations.pauseAfterRestart = restored
    assert(restored?.status === 'paused' && restored.desiredState === 'paused', 'Restart automatically resumed an unfinished task')
    assert(restored.transferredBytes > 0, 'Restart lost persisted received progress')
    await call(receiver, 'resume', offer.transferId)
    const done = await until(receiver, offer.transferId, (state) => state?.status === 'completed', 'restart completion', 75_000)
    assert(createHash('sha256').update(await fs.readFile(done.localPath)).digest('hex')
      === createHash('sha256').update(await fs.readFile(largeFile)).digest('hex'), 'Resumed file checksum differs')
    return { bytesBeforeRestart: before.transferredBytes, restoredBytes: restored.transferredBytes, totalBytes: done.totalBytes }
  })
  await scenario('cancel ends only one receive attempt and recall permanently ends sharing', async () => {
    sender.picks.push(largeFile)
    const offer = await call(sender, 'offerFromPicker', 'file')
    await call(receiver, 'receive', offer.attachment, offer.messageId)
    await until(receiver, offer.transferId, (state) => state?.transferredBytes > 0, 'cancel partial progress')
    await call(receiver, 'cancel', offer.transferId)
    assert((await snapshot(receiver, offer.transferId)).status === 'cancelled', 'Cancel state was not retained')
    assert(shares.get(offer.transferId)?.state === 'ACTIVE', 'Cancel incorrectly stopped sharing')
    await call(receiver, 'receive', offer.attachment, offer.messageId)
    await until(receiver, offer.transferId, (state) => state?.transferredBytes > 0 && state.status !== 'completed', 'recall partial progress')
    stop(shares.get(offer.transferId)!, 'RECALLED')
    const recalled = await until(receiver, offer.transferId, (state) => state?.status === 'recalled', 'recall invalidation')
    assert(recalled.desiredState === 'paused', 'Recalled transfer can still auto-resume')
    return { stoppedAtBytes: recalled.transferredBytes }
  })
  await scenario('signaling disconnect pauses a running receive and reconnect resumes its disk checkpoint', async () => {
    sender.picks.push(largeFile)
    const offer = await call(sender, 'offerFromPicker', 'file')
    await call(receiver, 'receive', offer.attachment, offer.messageId)
    await until(receiver, offer.transferId, (state) => state?.transferredBytes > 0 && state.status !== 'completed', 'network interruption progress')
    await call(receiver, 'setConnected', false)
    disconnectSignaling(receiver)
    const paused = await until(receiver, offer.transferId, (state) => state?.status === 'paused', 'network pause')
    assert(paused.desiredState === 'running' && paused.pauseReason === 'network', 'Network pause lost the running intent')
    receiver.connected = true
    await call(receiver, 'setConnected', true)
    const done = await until(receiver, offer.transferId, (state) => state?.status === 'completed', 'network resume completion', 75_000)
    assert(createHash('sha256').update(await fs.readFile(done.localPath)).digest('hex')
      === createHash('sha256').update(await fs.readFile(largeFile)).digest('hex'), 'Network-resumed file checksum differs')
    return { bytesBeforeDisconnect: paused.transferredBytes, totalBytes: done.totalBytes }
  })
  await scenario('file frames used real WebRTC with no relay servers', async () => {
    const transports = await Promise.all([sender, receiver, otherDevice].map(async (client) => ({
      client: client.label, ...(await call(client, 'snapshot')).transport,
    })))
    assert(transports.every((item) => item.relayServersConfigured === 0), 'A relay server was configured')
    assert(transports.reduce((sum, item) => sum + item.binaryBytesReceived, 0) > 0, 'No binary frames arrived over real RTCDataChannel')
    return transports
  })
  assert(Object.keys(controlAudit).every((command) => allowed[command]), 'Unknown signaling command carried payload')
  await closeClient(sender); await closeClient(receiver); await closeClient(otherDevice)
}

const watchdog = setTimeout(() => { console.error('P2P integration exceeded 210 seconds'); app.exit(1) }, 210_000)
run().then(async () => {
  await fs.writeFile(path.join(root!, 'report.json'), JSON.stringify({ ok: true, results, observations, controlAudit, fileRelayUsed: false }, null, 2))
}).catch(async (error) => {
  console.error(error)
  const snapshots: Record<string, any> = {}
  for (const client of clients.values()) snapshots[client.label] = await Promise.race([
    call(client, 'snapshot').catch(() => null), new Promise((resolve) => setTimeout(() => resolve('renderer unavailable'), 2000)),
  ])
  await fs.writeFile(path.join(root!, 'report.json'), JSON.stringify({ ok: false, error: String(error?.stack || error), results, observations, controlAudit, snapshots }, null, 2))
  process.exitCode = 1
}).finally(async () => {
  clearTimeout(watchdog)
  quitting = true
  try { await native?.suspendAll() } catch (error) { console.error(error) }
  for (const client of [...clients.values()]) {
    disconnect(client)
    if (!client.window.isDestroyed()) client.window.destroy()
  }
  app.exit(process.exitCode || 0)
})
app.on('window-all-closed', () => { if (quitting) app.quit() })
