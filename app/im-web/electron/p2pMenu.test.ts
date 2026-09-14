import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
const environment = vi.hoisted(() => ({ directory: '', handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(), save: vi.fn(), open: vi.fn(async () => ''), reveal: vi.fn() }))
vi.mock('electron', () => ({ app: { getPath: () => environment.directory }, BrowserWindow: {}, MessageChannelMain: {},
  ipcMain: { handle: (name: string, action: (...args: unknown[]) => Promise<unknown>) => environment.handlers.set(name, action) },
  dialog: { showSaveDialog: environment.save }, shell: { openPath: environment.open, showItemInFolder: environment.reveal },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (text: string) => Buffer.from('sealed:' + Buffer.from(text).toString('base64')),
    decryptString: (data: Buffer) => Buffer.from(data.toString().slice(7), 'base64').toString() },
}))
vi.mock('./p2pLegacy.js', () => ({ migrateLegacyP2pResults: async () => [] }))
import { registerP2pHandlers } from './p2pNative'
import { P2pTaskStorage } from './p2pTaskStorage'
import type { P2pSourceDescriptor } from './p2pSources'
const sender = { id: 1, once: vi.fn(), send: vi.fn(), isDestroyed: () => false }
const event = { sender } as unknown as IpcMainInvokeEvent
let close: () => Promise<void>
function invoke<T>(name: string, ...args: unknown[]) { return environment.handlers.get(name)!(event, ...args) as Promise<T> }
beforeEach(async () => {
  vi.clearAllMocks()
  environment.directory = await mkdtemp(join(tmpdir(), 'arttalk-p2p-menu-test-'))
  const native = registerP2pHandlers({ assertTrusted: () => {}, getWindow: () => undefined, getStorageDirectory: () => environment.directory })
  close = native.suspendAll
  await invoke('p2p:account', '1')
})
afterEach(async () => {
  await close()
  const path = resolve(environment.directory)
  if (dirname(path).toLowerCase() !== resolve(tmpdir()).toLowerCase() || !basename(path).startsWith('arttalk-p2p-menu-test-')) throw new Error('Unsafe test cleanup')
  await rm(path, { recursive: true, force: true })
})
async function outgoing() {
  const path = join(environment.directory, 'source.txt')
  await writeFile(path, 'fixture content')
  const { sources } = await invoke<{ sources: P2pSourceDescriptor[] }>('p2p:source-import', [path])
  await invoke('p2p:task-save', { taskId: 'send1', transferId: 'p2p_one', sourceId: sources[0]!.sourceId, direction: 'send', status: 'completed', conversationId: '10' })
  return { path, source: sources[0]! }
}
describe('P2P menu file capabilities', () => {
  it('opens and reveals only a known source and refuses paths passed as task IDs', async () => {
    const { path } = await outgoing()
    await invoke('p2p:open-result', 'send1')
    await invoke('p2p:reveal-result', 'send1')
    expect(environment.open).toHaveBeenCalledWith(path)
    expect(environment.reveal).toHaveBeenCalledWith(path)
    await expect(invoke('p2p:open-result', path)).rejects.toThrow('本机没有此传输记录')
  })
  it('creates a fresh source for forwarding and copies only after Save As selection', async () => {
    const { source } = await outgoing()
    const forwarded = await invoke<P2pSourceDescriptor[]>('p2p:task-source', 'send1')
    expect(forwarded[0]!.sourceId).not.toBe(source.sourceId)
    environment.save.mockResolvedValueOnce({ canceled: true })
    expect(await invoke('p2p:save-as', 'send1')).toEqual({ canceled: true })
    const destination = join(environment.directory, 'saved.txt')
    environment.save.mockResolvedValueOnce({ canceled: false, filePath: destination })
    await invoke('p2p:save-as', 'send1')
    expect(await readFile(destination, 'utf8')).toBe('fixture content')
  })
  it('refuses an undownloaded receiver record and a file removed after menu opening', async () => {
    const storage = new P2pTaskStorage(environment.directory)
    await storage.load('1')
    await storage.upsert('1', { taskId: 'receive1', transferId: 'p2p_recv', direction: 'receive', status: 'waiting', kind: 'file', name: 'pending.txt' })
    await close()
    close = registerP2pHandlers({ assertTrusted: () => {}, getWindow: () => undefined, getStorageDirectory: () => environment.directory }).suspendAll
    await invoke('p2p:account', '1')
    await expect(invoke('p2p:open-result', 'receive1')).rejects.toThrow('本地文件已移动或删除')
    const { path } = await outgoing()
    await rm(path)
    await expect(invoke('p2p:open-result', 'send1')).rejects.toThrow()
  })
  it('does not continue Save As after switching accounts while the dialog is open', async () => {
    await outgoing()
    let resolveDialog!: (result: { canceled: boolean; filePath: string }) => void
    environment.save.mockImplementationOnce(() => new Promise(resolve => { resolveDialog = resolve }))
    const saving = invoke('p2p:save-as', 'send1')
    const rejected = expect(saving).rejects.toThrow('账号已切换')
    await vi.waitFor(() => expect(resolveDialog).toBeTypeOf('function'))
    await invoke('p2p:account', '2')
    resolveDialog({ canceled: false, filePath: join(environment.directory, 'never-created.txt') })
    await rejected
  })
})
