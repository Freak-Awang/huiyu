import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ directory: '', encryption: true }))
vi.mock('electron', () => ({ app: { getPath: () => state.directory }, safeStorage: {
  isEncryptionAvailable: () => state.encryption,
  encryptString: (text: string) => Buffer.from('sealed:' + Buffer.from(text).toString('base64')),
  decryptString: (data: Buffer) => { if (!data.toString().startsWith('sealed:')) throw new Error('corrupt'); return Buffer.from(data.toString().slice(7), 'base64').toString() },
} }))
import { clearLocalMessages, getLocalMessageLibrary, listLocalMessages, searchLocalMessages, updateLocalMessageLibrary, upsertLocalMessage, type LocalMessageRecord } from './localMessages'
const message: LocalMessageRecord = { messageId: '10', clientMsgId: 'client-10', conversationId: '20', senderId: '2', senderName: '同事', senderAvatar: '', messageType: 'TEXT', content: '秘密内容', displayContent: '秘密内容', mentions: [], status: 'SENT', createdAt: '2026-09-11T00:00:00Z' }
beforeEach(() => { state.directory = mkdtempSync(join(tmpdir(), 'arttalk-message-library-test-')); state.encryption = true })
afterEach(() => {
  if (dirname(state.directory) !== tmpdir() || !state.directory.includes('arttalk-message-library-test-')) throw new Error('Unsafe test cleanup')
  rmSync(state.directory, { recursive: true, force: true })
})
describe('persistent local message actions', () => {
  it('does not resurrect deleted messages after history/ACK replay or cache cleanup', async () => {
    await upsertLocalMessage('1', message)
    await updateLocalMessageLibrary('1', 'delete', [message])
    await upsertLocalMessage('1', message)
    await upsertLocalMessage('1', { ...message, messageId: '', status: 'FAILED' })
    expect(await listLocalMessages('1', '20')).toEqual([])
    expect(await searchLocalMessages('1', '20', '秘密')).toEqual([])
    await clearLocalMessages('1')
    await upsertLocalMessage('1', message)
    expect(await listLocalMessages('1', '20')).toEqual([])
    await upsertLocalMessage('2', message)
    expect(await listLocalMessages('2', '20')).toHaveLength(1)
  })
  it('encrypts favorites, isolates accounts, and removes recalled snapshots', async () => {
    await updateLocalMessageLibrary('1', 'favorite', [message])
    await updateLocalMessageLibrary('1', 'favorite', [message])
    expect((await getLocalMessageLibrary('1')).favorites).toHaveLength(1)
    expect((await getLocalMessageLibrary('2')).favorites).toEqual([])
    expect(readFileSync(join(state.directory, 'local-messages-v1.json'), 'utf8')).not.toContain('秘密内容')
    await upsertLocalMessage('1', { ...message, status: 'RECALLED', content: '', displayContent: '' })
    expect((await getLocalMessageLibrary('1')).favorites).toEqual([])
  })
  it('rejects unsafe identities and oversized batch requests', async () => {
    await expect(updateLocalMessageLibrary('__proto__', 'delete', [message])).rejects.toThrow('标识')
    await expect(updateLocalMessageLibrary('1', 'delete', Array(101).fill(message))).rejects.toThrow('批量')
  })
  it('does not report success or overwrite data when encryption/storage fails', async () => {
    state.encryption = false
    await expect(updateLocalMessageLibrary('1', 'delete', [message])).rejects.toThrow('安全存储')
    state.encryption = true
    writeFileSync(join(state.directory, 'local-messages-v1.json'), 'broken')
    await expect(updateLocalMessageLibrary('1', 'favorite', [message])).rejects.toThrow('保留原文件')
    expect(readFileSync(join(state.directory, 'local-messages-v1.json'), 'utf8')).toBe('broken')
  })
})
