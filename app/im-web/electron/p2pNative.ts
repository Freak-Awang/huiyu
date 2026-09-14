import { app, BrowserWindow, dialog, ipcMain, MessageChannelMain, shell } from 'electron'
import type { IpcMainInvokeEvent, MessagePortMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, lstat, realpath } from 'node:fs/promises'
import { join, dirname, basename, resolve } from 'node:path'
import { P2pTaskStorage, mergeRendererTaskPatch, type NativeTask, type NativeTaskPatch } from './p2pTaskStorage.js'
import { P2pSourceStore } from './p2pSources.js'
import { P2pReceiver, checkDestination, pathExists, uniqueResultPath, verifyResult, type ReceiveManifest } from './p2pReceive.js'
import { safeP2pRelativePath } from './p2pReceiveSafety.js'
import { migrateLegacyP2pResults } from './p2pLegacy.js'

interface NativeOptions {
  assertTrusted: (event: IpcMainInvokeEvent) => void
  getWindow: (event: IpcMainInvokeEvent) => BrowserWindow | undefined
  getStorageDirectory: () => string | Promise<string>
  getClientRoot?: (event: IpcMainInvokeEvent) => string
}
const finalStatuses = new Set(['completed', 'cancelled', 'stopped', 'recalled'])

class NativeClient {
  private userId: string | null = null
  private records = new Map<string, NativeTask>()
  private receivers = new Map<string, P2pReceiver>()
  private ports = new Map<string, MessagePortMain>()
  private accountWork: Promise<unknown> = Promise.resolve()
  readonly storage: P2pTaskStorage
  readonly sources: P2pSourceStore
  constructor(private event: IpcMainInvokeEvent, private options: NativeOptions) {
    this.storage = new P2pTaskStorage(options.getClientRoot?.(event) || app.getPath('userData'))
    this.sources = new P2pSourceStore({ load: (user) => this.storage.loadSources(user), save: (user, records) => this.storage.saveSources(user, records),
      onProgress: (progress) => { if (!event.sender.isDestroyed()) event.sender.send('p2p:source-progress', progress) } })
  }
  private account() { if (!this.userId) throw new Error('请先登录并恢复本机传输任务'); return this.userId }
  async setAccount(userId: string | null) {
    const work = this.accountWork.catch(() => undefined).then(async () => {
      await this.suspendAll()
      this.userId = null
      await this.sources.setAccount(null)
      await this.storage.flush()
      this.records.clear(); this.receivers.clear()
      this.storage.setAccount(userId)
      if (!userId) return []
      try {
        const records = await this.storage.load(userId)
        this.userId = userId
        await this.sources.setAccount(userId)
        records.push(...await migrateLegacyP2pResults(userId, this.options.getClientRoot?.(this.event) || app.getPath('userData'), this.storage))
        for (const task of records) this.records.set(task.taskId, task)
        for (const task of records) {
          if (task.direction === 'receive' && task.receiveId && !finalStatuses.has(task.status)) {
            const receiver = this.receiver(task.receiveId)
            try { await receiver.reconcile() } catch (error) { task.error = String((error as Error).message || error) }
          }
          if (!finalStatuses.has(task.status)) {
            task.status = 'paused'; task.pauseReason = 'restart'; task.desiredState = 'paused'; task.routeId = undefined
            await this.persist(task)
          }
        }
        return [...this.records.values()]
      } catch (error) {
        this.userId = null; this.storage.setAccount(null); await this.sources.setAccount(null)
        throw error
      }
    })
    this.accountWork = work
    return work
  }
  list() { this.account(); return [...this.records.values()] }
  private find(id: string) {
    this.account()
    const task = this.records.get(id) || [...this.records.values()].reverse().find((entry) => entry.transferId === id)
    if (!task) throw new Error('本机没有此传输记录，请从原文件消息重新接收')
    return task
  }
  private async persist(task: NativeTask) {
    const saved = await this.storage.upsert(this.account(), task)
    // A disk write can finish after a newer checkpoint/control changed the live task.
    // Applying its old snapshot here would erase those already accepted changes.
    task.createdAt = saved.createdAt
    task.updatedAt = saved.updatedAt
    this.records.set(task.taskId, task)
    return task
  }
  async saveTask(patch: NativeTaskPatch) {
    this.account()
    if (!patch?.taskId) throw new Error('传输任务标识缺失')
    let task = this.records.get(patch.taskId)
    if (!task) {
      if (patch.direction !== 'send' || !patch.sourceId) throw new Error('接收任务只能通过保存位置选择器创建')
      const record = this.sources.get(patch.sourceId)
      const source = record.source
      if (!patch.transferId || (!/^p2p_[a-z0-9]+$/i.test(patch.transferId) && !patch.transferId.startsWith('draft_'))) throw new Error('分享标识无效')
      task = { taskId: patch.taskId, transferId: patch.transferId, direction: 'send', status: patch.status || 'preparing',
        conversationId: String(patch.conversationId || ''), messageId: String(patch.messageId || ''),
        ...source, totalBytes: source.totalSize, transferredBytes: 0, progress: 0,
        manifest: record.manifest, content: patch.content, draftId: patch.draftId }
      this.records.set(task.taskId, task)
    }
    if (patch.transferId !== task.transferId || patch.direction !== task.direction) throw new Error('任务身份不匹配')
    Object.assign(task, mergeRendererTaskPatch(task, patch))
    if (patch.pendingControls) {
      if (patch.pendingControls.length > 100 || patch.pendingControls.some((control) => !['P2P_ROUTE_END', 'P2P_SHARE_STOP'].includes(control.cmd)
        || control.data?.transferId !== task!.transferId)) throw new Error('传输控制队列无效')
    }
    if (task.direction === 'send') {
      task.transferredBytes = Math.min(task.totalSize, Math.max(0, Number(patch.transferredBytes ?? task.transferredBytes)))
      task.progress = task.status === 'completed' ? 1 : task.totalSize ? task.transferredBytes / task.totalSize : 0
    }
    return this.persist(task)
  }
  async deleteTask(id: string) {
    const task = this.find(id)
    if (!task.transferId.startsWith('draft_')) throw new Error('仅可删除待发送准备记录')
    await this.storage.delete(this.account(), task.taskId)
    this.records.delete(task.taskId)
    return true
  }
  async pick(kind: 'file' | 'folder') {
    this.account()
    if (!['file', 'folder'].includes(kind)) throw new Error('选择类型无效')
    const user = this.userId
    const selected = await this.openDialog({ title: kind === 'folder' ? '选择完整文件夹' : '选择 P2P 文件',
      properties: kind === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections'] })
    if (selected.canceled) return { canceled: true, sources: [] }
    if (user !== this.userId) throw new Error('账号已切换')
    return { canceled: false, sources: await this.sources.importPaths(selected.filePaths) }
  }
  async importPaths(paths: string[]) { this.account(); return { canceled: false, sources: await this.sources.importPaths(paths) } }
  private openDialog(options: Electron.OpenDialogOptions) {
    const parent = this.options.getWindow(this.event)
    return parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options)
  }
  private async chooseDestination(kind: 'file' | 'folder', name: string) {
    const parent = this.options.getWindow(this.event)
    const directory = await this.options.getStorageDirectory()
    if (kind === 'file') {
      const options = { title: '接收 P2P 文件', defaultPath: join(directory, basename(name)) }
      const selected = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
      return selected.canceled || !selected.filePath ? undefined : selected.filePath
    }
    const selected = await this.openDialog({ title: '选择文件夹保存位置', defaultPath: directory, properties: ['openDirectory', 'createDirectory'] })
    return selected.canceled || !selected.filePaths[0] ? undefined : uniqueResultPath(join(selected.filePaths[0], basename(name)))
  }
  async start(payload: NativeTask['content'] & { conversationId?: string; messageId?: string }) {
    const user = this.account()
    if (!payload || !/^p2p_[a-z0-9]+$/i.test(payload.transferId) || !['file', 'folder'].includes(payload.kind)
      || !Number.isSafeInteger(payload.totalSize) || payload.totalSize < 0 || !Number.isInteger(payload.fileCount) || payload.fileCount < 0
      || payload.fileCount > 10000 || (payload.directoryCount || 0) > 10000
      || (payload.kind === 'file' && (payload.fileCount !== 1 || payload.totalSize > 2 * 1024 ** 3))
      || (payload.kind === 'folder' && payload.totalSize > 20 * 1024 ** 3)) throw new Error('接收文件摘要无效')
    if (safeP2pRelativePath(payload.name) !== payload.name || payload.name.includes('/')) throw new Error('文件名称不安全')
    const localPath = await this.chooseDestination(payload.kind, payload.name)
    if (!localPath) return { canceled: true, success: false }
    if (user !== this.userId) throw new Error('账号已切换')
    if ([...this.records.values()].some((record) => !finalStatuses.has(record.status) && record.localPath?.toLowerCase() === localPath.toLowerCase())) throw new Error('该保存位置已有未完成任务')
    await checkDestination(dirname(localPath), payload.totalSize)
    const taskId = `recv_${randomUUID().replaceAll('-', '')}`
    const task: NativeTask = { taskId, receiveId: taskId, transferId: payload.transferId,
      direction: 'receive', status: 'connecting', name: payload.name, kind: payload.kind,
      conversationId: payload.conversationId || '', messageId: payload.messageId || '',
      totalSize: payload.totalSize, totalBytes: payload.totalSize, transferredBytes: 0, progress: 0,
      fileCount: payload.fileCount, directoryCount: payload.directoryCount || 0, content: payload,
      localPath, temporaryPath: join(dirname(localPath), `.arttalk-${randomUUID()}.part`), desiredState: 'running' }
    await this.persist(task)
    this.receiver(taskId); this.bindPort(taskId)
    return { canceled: false, success: true, taskId, receiveId: taskId, finalPath: localPath }
  }
  receiver(id: string) {
    const task = this.find(id)
    if (task.direction !== 'receive' || !task.receiveId) throw new Error('接收任务不存在')
    let receiver = this.receivers.get(task.receiveId)
    if (!receiver) {
      receiver = new P2pReceiver(task, (next) => this.persist(next), (event) => {
        if (!this.event.sender.isDestroyed()) this.event.sender.send('p2p:receive-progress', event)
      })
      this.receivers.set(task.receiveId, receiver)
    }
    return receiver
  }
  private bindPort(id: string) {
    this.ports.get(id)?.close()
    const { port1, port2 } = new MessageChannelMain()
    const receiver = this.receiver(id)
    const user = this.account()
    this.ports.set(id, port2)
    let pendingBytes = 0
    port2.on('message', ({ data }) => {
      if (this.userId !== user || this.receivers.get(id) !== receiver) return
      const requestId = String(data?.requestId || '')
      const bytes = data?.data instanceof ArrayBuffer ? data.data.byteLength : -1
      if (!requestId || bytes < 1 || bytes > 65536 || pendingBytes + bytes > 8 * 1024 * 1024) {
        port2.postMessage({ requestId, ok: false, error: '接收写入请求无效或队列过大' }); return
      }
      pendingBytes += bytes
      void receiver.write(Number(data.fileIndex), Number(data.offset), data.data).then((result) => {
        if (this.ports.get(id) === port2) port2.postMessage({ requestId, ok: true, ...result })
      }, (error) => {
        if (this.ports.get(id) === port2) port2.postMessage({ requestId, ok: false, error: String(error.message || error) })
      }).finally(() => { pendingBytes -= bytes })
    })
    port2.start(); this.event.sender.postMessage('p2p:receive-port', { receiveId: id }, [port1])
  }
  async restore(id: string) {
    const result = await this.receiver(id).restore()
    if (this.find(id).status !== 'completed') this.bindPort(id)
    return { ...result, status: this.find(id).status, completed: this.find(id).status === 'completed' }
  }
  async suspend(id: string, reason = 'manual') {
    const result = await this.receiver(id).suspend(reason)
    this.ports.get(id)?.close(); this.ports.delete(id)
    return result
  }
  async abort(id: string) {
    const result = await this.receiver(id).abort()
    this.ports.get(id)?.close(); this.ports.delete(id)
    this.receivers.delete(id)
    return result
  }
  async commit(id: string) {
    const result = await this.receiver(id).commit()
    this.ports.get(id)?.close(); this.ports.delete(id)
    this.receivers.delete(id)
    return result
  }
  async locateSource(id: string) {
    const user = this.account(); const record = this.sources.get(id)
    const selected = await this.openDialog({ title: '定位与原消息相同的源文件', properties: [record.source.kind === 'folder' ? 'openDirectory' : 'openFile'] })
    if (selected.canceled || !selected.filePaths[0]) return { canceled: true }
    if (user !== this.userId) throw new Error('账号已切换')
    return { canceled: false, ...await this.sources.locate(id, selected.filePaths[0]) }
  }
  async openResult(id: string, reveal = false) {
    const user = this.account()
    const task = this.find(id)
    const path = await this.taskPath(task)
    if (user !== this.userId) throw new Error('账号已切换')
    if (reveal) shell.showItemInFolder(path)
    else {
      const error = await shell.openPath(path)
      if (error) return { success: false, error }
    }
    return { success: true, path }
  }
  private async taskPath(task: NativeTask) {
    if (task.direction === 'send' && task.sourceId) {
      await this.sources.validate(task.sourceId)
      return this.sources.get(task.sourceId).rootPath
    }
    if (task.direction !== 'receive' || task.status !== 'completed' || !task.localPath || !await pathExists(task.localPath)) {
      throw new Error('本地文件已移动或删除，请定位文件或重新接收')
    }
    const info = await lstat(task.localPath)
    if (info.isSymbolicLink()) throw new Error('文件路径已变为链接，请重新定位原文件')
    if (resolve(await realpath(task.localPath)).toLowerCase() !== resolve(task.localPath).toLowerCase()) throw new Error('文件路径包含链接，请重新定位原文件')
    return task.localPath
  }
  async sourceFromTask(id: string) {
    const user = this.account(); const task = this.find(id)
    const path = await this.taskPath(task)
    if (task.direction === 'receive' && !await verifyResult(task, path)) throw new Error('本地文件已改变，不能转发原消息')
    if (user !== this.userId) throw new Error('账号已切换')
    // A fresh source goes through the existing P2P offer flow; never reuse a conversation-bound transfer token.
    return this.sources.importPaths([path])
  }
  async saveAs(id: string) {
    const user = this.account(); const task = this.find(id)
    if (task.kind !== 'file') throw new Error('文件夹请使用打开文件所在位置')
    const source = await this.taskPath(task)
    const parent = this.options.getWindow(this.event)
    const options = { title: '文件另存为', defaultPath: basename(task.name) }
    const selected = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
    if (selected.canceled || !selected.filePath) return { canceled: true }
    if (user !== this.userId) throw new Error('账号已切换')
    if (resolve(source).toLowerCase() === resolve(selected.filePath).toLowerCase()) throw new Error('请选择不同的保存位置')
    if (await pathExists(selected.filePath) && (await lstat(selected.filePath)).isSymbolicLink()) throw new Error('不能覆盖符号链接')
    await checkDestination(dirname(selected.filePath), task.totalBytes)
    if (user !== this.userId) throw new Error('账号已切换')
    await copyFile(source, selected.filePath)
    return { canceled: false }
  }
  async locateResult(id: string) {
    const user = this.account(); const task = this.find(id)
    if (task.direction !== 'receive') throw new Error('只能定位本机接收文件')
    const selected = await this.openDialog({ title: '定位已接收文件', properties: [task.kind === 'folder' ? 'openDirectory' : 'openFile'] })
    if (selected.canceled || !selected.filePaths[0]) return { canceled: true, success: false }
    if (user !== this.userId) throw new Error('账号已切换')
    if (!await verifyResult(task, selected.filePaths[0])) return { canceled: false, success: false, error: '所选内容与原接收文件不一致' }
    task.localPath = selected.filePaths[0]; task.status = 'completed'; await this.persist(task)
    return { canceled: false, success: true, path: task.localPath }
  }
  async changeDestination(id: string) {
    const user = this.account(); const task = this.find(id)
    const destination = await this.chooseDestination(task.kind, task.name)
    if (!destination) return { canceled: true, success: false }
    if (user !== this.userId) throw new Error('账号已切换')
    return { canceled: false, ...await this.receiver(id).changeDestination(destination) }
  }
  async suspendAll() {
    for (const receiver of this.receivers.values()) await receiver.suspend('restart')
    for (const port of this.ports.values()) port.close()
    this.ports.clear()
    for (const task of this.records.values()) {
      if (!finalStatuses.has(task.status)) {
        task.status = 'paused'; task.desiredState = 'paused'; task.pauseReason = 'restart'; task.routeId = undefined
        await this.persist(task)
      }
    }
    await this.storage.flush()
  }
}

/** Registers only account-bound local filesystem capabilities. No upload or relay endpoint is used. */
export function registerP2pHandlers(options: NativeOptions) {
  const clients = new Map<number, NativeClient>()
  function client(event: IpcMainInvokeEvent) {
    options.assertTrusted(event)
    let result = clients.get(event.sender.id)
    if (!result) {
      result = new NativeClient(event, options); clients.set(event.sender.id, result)
      const owned = result
      event.sender.once('destroyed', () => { void owned.suspendAll().finally(() => clients.delete(event.sender.id)).catch(() => undefined) })
    }
    return result
  }
  function handle<Args extends unknown[], Result>(name: string, fn: (native: NativeClient, ...args: Args) => Result) {
    ipcMain.handle(name, (event, ...args) => fn(client(event), ...args as Args))
  }
  handle('p2p:account', (native, user: string | null) => native.setAccount(user))
  handle('p2p:tasks', (native) => native.list())
  handle('p2p:task-save', (native, task: NativeTaskPatch) => native.saveTask(task))
  handle('p2p:task-delete', (native, id: string) => native.deleteTask(id))
  handle('p2p:source-pick', (native, kind: 'file' | 'folder') => native.pick(kind))
  handle('p2p:source-import', (native, paths: string[]) => native.importPaths(paths))
  handle('p2p:source-prepare', (native, id: string) => native.sources.prepare(id))
  handle('p2p:source-cancel', (native, id: string) => { native.sources.cancel(id); return true })
  handle('p2p:source-read', (native, id: string, index: number, offset: number, length: number) => native.sources.readChunk(id, index, offset, length))
  handle('p2p:source-locate', (native, id: string) => native.locateSource(id))
  handle('p2p:source-validate', (native, id: string) => native.sources.validate(id))
  handle('p2p:receive-start', (native, payload: Parameters<NativeClient['start']>[0]) => native.start(payload))
  handle('p2p:receive-prepare', (native, id: string, manifest: ReceiveManifest) => native.receiver(id).prepare(manifest))
  handle('p2p:receive-restore', (native, id: string) => native.restore(id))
  handle('p2p:receive-suspend', (native, id: string, reason?: string) => native.suspend(id, reason))
  handle('p2p:receive-finish-file', (native, id: string, index: number) => native.receiver(id).finish(index))
  handle('p2p:receive-commit', (native, id: string) => native.commit(id))
  handle('p2p:receive-abort', (native, id: string) => native.abort(id))
  handle('p2p:receive-cleanup', (native, id: string) => native.receiver(id).retryCleanup())
  handle('p2p:open-result', (native, id: string) => native.openResult(id))
  handle('p2p:reveal-result', (native, id: string) => native.openResult(id, true))
  handle('p2p:save-as', (native, id: string) => native.saveAs(id))
  handle('p2p:task-source', (native, id: string) => native.sourceFromTask(id))
  handle('p2p:locate-result', (native, id: string) => native.locateResult(id))
  handle('p2p:receive-destination', (native, id: string) => native.changeDestination(id))
  return { suspendAll: async () => { for (const native of clients.values()) await native.suspendAll() } }
}
