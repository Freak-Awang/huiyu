import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ directory: '', encryption: true }))
vi.mock('electron', () => ({
  app: { getPath: () => state.directory },
  safeStorage: {
    isEncryptionAvailable: () => state.encryption,
    encryptString: (value: string) => Buffer.from('sealed:' + Buffer.from(value).toString('base64')),
    decryptString: (value: Buffer) => {
      if (!value.toString().startsWith('sealed:')) throw new Error('corrupt encrypted data')
      return Buffer.from(value.toString().slice(7), 'base64').toString()
    },
  },
}))
import { listLocalDrafts, saveLocalDraft } from './localDrafts'

describe('encrypted desktop draft persistence', () => {
  beforeEach(() => { state.directory = mkdtempSync(join(tmpdir(), 'arttalk-drafts-test-')); state.encryption = true })
  afterEach(() => {
    if (dirname(state.directory) !== tmpdir() || !state.directory.includes('arttalk-drafts-test-')) throw new Error('Unsafe test cleanup')
    rmSync(state.directory, { recursive: true, force: true })
  })
  const draft = { text: '未发送的私密草稿', mentions: [{ userId: '2', nickname: '同事' }], replyTo: { messageId: '9', senderName: '同事', text: '引用' } }
  it('reads persisted drafts with account isolation and deletes a sent draft', () => {
    saveLocalDraft('1', '10', draft)
    saveLocalDraft('1', '11', { ...draft, text: '另一会话' })
    expect(listLocalDrafts('1')['10']).toMatchObject(draft)
    expect(listLocalDrafts('2')).toEqual({})
    expect(readFileSync(join(state.directory, 'conversation-drafts-v1.enc'), 'utf8')).not.toContain(draft.text)
    saveLocalDraft('1', '10', null)
    expect(listLocalDrafts('1')['10']).toBeUndefined()
    expect(listLocalDrafts('1')['11']?.text).toBe('另一会话')
  })
  it('refuses plaintext fallback and does not overwrite a corrupt store', () => {
    state.encryption = false
    expect(() => saveLocalDraft('1', '10', draft)).toThrow('安全存储')
    state.encryption = true
    const path = join(state.directory, 'conversation-drafts-v1.enc')
    writeFileSync(path, 'corrupt')
    expect(() => saveLocalDraft('1', '10', draft)).toThrow('corrupt')
    expect(readFileSync(path, 'utf8')).toBe('corrupt')
  })
})
