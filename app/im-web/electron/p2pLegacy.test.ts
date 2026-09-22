import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const environment = vi.hoisted(() => ({ directory: '', inspected: [] as string[], sizes: new Map<string, number>() }))
vi.mock('electron', () => ({
  app: { getPath: () => environment.directory },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from('sealed:' + Buffer.from(value).toString('base64')),
    decryptString: (value: Buffer) => {
      if (!value.toString().startsWith('sealed:')) throw new Error('corrupt')
      return Buffer.from(value.toString().slice(7), 'base64').toString()
    },
  },
}))
vi.mock('node:fs/promises', async (original) => {
  const real = await original<typeof import('node:fs/promises')>()
  return { ...real, stat: async (path: string) => {
    environment.inspected.push(String(path))
    const info = await real.stat(path)
    const size = environment.sizes.get(String(path))
    return size === undefined ? info : Object.assign(Object.create(Object.getPrototypeOf(info)), info, { size })
  } }
})

import { listLocalP2pMessages, upsertLocalMessage, type LocalMessageRecord } from './localMessages'
import { migrateLegacyP2pResults } from './p2pLegacy'
import { P2pTaskStorage } from './p2pTaskStorage'

function message(id: string, changes: Partial<LocalMessageRecord> = {}): LocalMessageRecord {
  return {
    messageId: `message-${id}`, conversationId: 'conversation-1', senderId: 'sender', senderName: 'sender', senderAvatar: '',
    messageType: 'FILE', content: JSON.stringify({ version: 1, transferMode: 'p2p_lan', transferId: `p2p_${id}`, kind: 'file', name: `${id}.txt`, totalSize: 3, fileCount: 1, sha256: 'a'.repeat(64) }),
    displayContent: '', mentions: [], createdAt: '2026-09-08T12:00:00.000Z', status: 'SENT', ...changes,
  }
}
function summaryPatch(source: LocalMessageRecord, changes: Record<string, unknown>): LocalMessageRecord {
  return { ...source, content: JSON.stringify({ ...JSON.parse(source.content), ...changes }) }
}

describe('legacy P2P completed path migration', () => {
  let storage: P2pTaskStorage
  beforeEach(async () => {
    environment.directory = await mkdtemp(join(tmpdir(), 'arttalk-p2p-legacy-test-'))
    environment.inspected = []
    environment.sizes.clear()
    storage = new P2pTaskStorage(environment.directory)
    await storage.load('account-a')
  })
  afterEach(async () => {
    await storage.flush()
    const absolute = resolve(environment.directory)
    if (dirname(absolute).toLowerCase() !== resolve(tmpdir()).toLowerCase() || !basename(absolute).startsWith('arttalk-p2p-legacy-test-')) throw new Error('Unsafe test cleanup')
    await rm(absolute, { recursive: true, force: true })
  })
  const legacyPath = () => join(environment.directory, 'p2p-completed-paths.json')
  async function writeIndex(index: Record<string, string>) { await writeFile(legacyPath(), JSON.stringify(index)) }
  async function file(name: string, body = 'abc') {
    const path = join(environment.directory, name)
    await writeFile(path, body)
    return path
  }

  it('only imports paths proved by the active account original received message', async () => {
    const received = await file('received.txt')
    const otherAccount = await file('other-account.txt')
    const ownSend = await file('own-send.txt')
    const recalled = await file('recalled.txt')
    const unowned = await file('unowned.txt')
    const index = { p2p_received: received, p2p_other: otherAccount, p2p_own: ownSend, p2p_recalled: recalled, p2p_unowned: unowned }
    await writeIndex(index)
    await Promise.all([
      upsertLocalMessage('account-a', message('received')),
      upsertLocalMessage('account-b', message('other')),
      upsertLocalMessage('account-a', message('own', { senderId: 'account-a' })),
      upsertLocalMessage('account-a', message('recalled', { status: 'RECALLED' })),
    ])
    const result = await migrateLegacyP2pResults('account-a', environment.directory, storage)
    expect(result.map((task) => task.taskId)).toEqual(['legacy_p2p_received'])
    expect(result[0]).toMatchObject({ status: 'completed', direction: 'receive', localPath: received, messageId: 'message-received', content: JSON.parse(message('received').content) })
    expect(environment.inspected).toEqual([received])
    expect(JSON.parse(await readFile(legacyPath(), 'utf8'))).toEqual(index)
    expect(await readFile(unowned, 'utf8')).toBe('abc')
    const other = await migrateLegacyP2pResults('account-b', environment.directory, storage)
    expect(other.map((task) => task.transferId)).toEqual(['p2p_other'])
  })

  it('preserves received folders with one metadata lookup and no synthetic full manifest', async () => {
    const folder = join(environment.directory, 'received-folder')
    await mkdir(folder)
    const original = summaryPatch(message('folder', { messageType: 'FOLDER' }), { kind: 'folder', fileCount: 2, totalSize: 24 * 1024 ** 3, manifestSha256: 'b'.repeat(64), sha256: undefined })
    await upsertLocalMessage('account-a', original)
    await writeIndex({ p2p_folder: folder })
    const [record] = await migrateLegacyP2pResults('account-a', environment.directory, storage)
    expect(record.kind).toBe('folder')
    expect(record.totalSize).toBe(24 * 1024 ** 3)
    expect(record.finalPath).toBe(folder)
    expect(record.manifest).toBeUndefined()
    expect(record.content?.manifestSha256).toBe('b'.repeat(64))
    expect(environment.inspected).toEqual([folder])
  })

  it('imports large completed files without losing their original size', async () => {
    const path = await file('large.bin')
    const size = 4 * 1024 ** 3 + 17
    environment.sizes.set(path, size)
    await upsertLocalMessage('account-a', summaryPatch(message('large'), { totalSize: size }))
    await writeIndex({ p2p_large: path })
    const [record] = await migrateLegacyP2pResults('account-a', environment.directory, storage)
    expect(record).toMatchObject({ localPath: path, totalSize: size, transferredBytes: size, status: 'completed' })
  })

  it('does not duplicate migration or replace an existing newer receive task', async () => {
    const old = await file('old.txt')
    const newer = await file('new.txt')
    await upsertLocalMessage('account-a', message('one'))
    await upsertLocalMessage('account-a', message('two'))
    await writeIndex({ p2p_one: old, p2p_two: old })
    await storage.upsert('account-a', { taskId: 'new-task', transferId: 'p2p_two', direction: 'receive', status: 'completed', localPath: newer })
    expect((await migrateLegacyP2pResults('account-a', environment.directory, storage)).map((record) => record.transferId)).toEqual(['p2p_one'])
    await storage.upsert('account-a', { taskId: 'legacy_p2p_one', localPath: newer })
    expect(await migrateLegacyP2pResults('account-a', environment.directory, storage)).toEqual([])
    const tasks = await storage.load('account-a')
    expect(tasks).toHaveLength(2)
    expect(tasks.every((record) => record.localPath === newer)).toBe(true)
  })

  it('waits for pending cache updates and leaves revoked records unmigrated', async () => {
    const path = await file('one.txt')
    await writeIndex({ p2p_one: path })
    await upsertLocalMessage('account-a', message('one'))
    const pending = upsertLocalMessage('account-a', message('one', { status: 'RECALLED' }))
    const cached = await listLocalP2pMessages('account-a')
    expect(cached[0].status).toBe('RECALLED')
    await pending
    expect(await migrateLegacyP2pResults('account-a', environment.directory, storage)).toEqual([])
    expect(environment.inspected).toEqual([])
  })

  it('skips invalid summaries, relative paths, missing files and file-size mismatches', async () => {
    const valid = await file('existing.txt')
    const oversized = await file('changed.txt', 'longer')
    const fixtures = [summaryPatch(message('badmode'), { transferMode: 'server' }), summaryPatch(message('badhash'), { sha256: 'bad' }), message('relative'), message('missing'), message('changed')]
    await Promise.all(fixtures.map((entry) => upsertLocalMessage('account-a', entry)))
    await writeIndex({ p2p_badmode: valid, p2p_badhash: valid, p2p_relative: 'relative.txt', p2p_missing: join(environment.directory, 'missing.txt'), p2p_changed: oversized })
    expect(await migrateLegacyP2pResults('account-a', environment.directory, storage)).toEqual([])
    expect(environment.inspected).not.toContain(valid)
    expect(environment.inspected).not.toContain('relative.txt')
  })

  it('retains ambiguous registry entries and does not claim a path with conflicting cached message identities', async () => {
    const path = await file('same.txt')
    await writeIndex({ p2p_same: path })
    await upsertLocalMessage('account-a', message('same'))
    await upsertLocalMessage('account-a', message('same', { messageId: 'another-message', conversationId: 'another-conversation' }))
    expect(await migrateLegacyP2pResults('account-a', environment.directory, storage)).toEqual([])
    expect(environment.inspected).toEqual([])
    expect(await readFile(legacyPath(), 'utf8')).toContain('p2p_same')
  })

  it('keeps malformed legacy indexes untouched and returns only file/folder history for the selected account', async () => {
    await Promise.all([
      upsertLocalMessage('account-a', message('file')),
      upsertLocalMessage('account-a', message('text', { messageType: 'TEXT' })),
      upsertLocalMessage('account-b', message('other')),
    ])
    expect((await listLocalP2pMessages('account-a')).map((entry) => entry.messageId)).toEqual(['message-file'])
    await writeFile(legacyPath(), 'malformed-index')
    expect(await migrateLegacyP2pResults('account-a', environment.directory, storage)).toEqual([])
    expect(await readFile(legacyPath(), 'utf8')).toBe('malformed-index')
    expect(await listLocalP2pMessages('missing-account')).toEqual([])
  })
})
