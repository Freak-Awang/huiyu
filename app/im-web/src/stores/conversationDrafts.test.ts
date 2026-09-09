import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useConversationDrafts, type ConversationDraft } from './conversationDrafts'

describe('conversation drafts', () => {
  const scopes: ReturnType<typeof effectScope>[] = []
  let disk: Record<string, Record<string, ConversationDraft>>
  let bridge: { listDrafts: ReturnType<typeof vi.fn>; saveDraft: ReturnType<typeof vi.fn> }
  function mount(user = ref('alice'), conversation = ref<string | undefined>('one')) {
    const scope = effectScope()
    scopes.push(scope)
    return { user, conversation, drafts: scope.run(() => useConversationDrafts(user, conversation))! }
  }
  beforeEach(() => {
    disk = {}
    bridge = {
      listDrafts: vi.fn(async (user: string) => JSON.parse(JSON.stringify(disk[user] || {}))),
      saveDraft: vi.fn(async (user: string, conversation: string, draft: ConversationDraft) => {
        (disk[user] ||= {})[conversation] = JSON.parse(JSON.stringify(draft))
        return true
      }),
    }
    vi.stubGlobal('window', { imDesktop: bridge })
  })
  afterEach(() => { scopes.splice(0).forEach((scope) => scope.stop()); vi.unstubAllGlobals() })

  it('isolates text, mentions and quoted replies synchronously on a conversation switch', async () => {
    const { conversation, drafts } = mount()
    drafts.text.value = '@小李 请核对'
    drafts.mentions.value = [{ userId: '2', nickname: '小李' }]
    drafts.replyTo.value = { messageId: '30', senderName: '小李', text: '预算' }
    conversation.value = 'two'
    expect(drafts.text.value).toBe('')
    expect(drafts.mentions.value).toEqual([])
    expect(drafts.replyTo.value).toBeNull()
    drafts.text.value = '另一会话'
    conversation.value = 'one'
    expect(drafts.text.value).toBe('@小李 请核对')
    expect(drafts.mentions.value[0]?.userId).toBe('2')
    expect(drafts.replyTo.value?.messageId).toBe('30')
    await drafts.flush()
  })

  it('restores all fields after restart without exposing them to a different account', async () => {
    const first = mount()
    first.drafts.text.value = '尚未发送'
    first.drafts.replyTo.value = { messageId: '31', senderName: '甲', text: '原文' }
    await first.drafts.flush()
    const second = mount()
    await vi.waitFor(() => expect(second.drafts.text.value).toBe('尚未发送'))
    expect(second.drafts.replyTo.value?.messageId).toBe('31')
    second.user.value = 'bob'
    expect(second.drafts.text.value).toBe('')
    expect(second.drafts.replyTo.value).toBeNull()
  })

  it('does not overwrite typing that occurs while stored drafts are loading', async () => {
    let finish!: (drafts: Record<string, ConversationDraft>) => void
    bridge.listDrafts.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const { drafts } = mount()
    drafts.text.value = '刚输入的'
    finish({ one: { text: '旧草稿', mentions: [], replyTo: null } })
    await drafts.flush()
    expect(drafts.text.value).toBe('刚输入的')
  })

  it('clears only the sent snapshot, preserving edits made during attachment upload', async () => {
    const { conversation, drafts } = mount()
    drafts.text.value = '随附件发送'
    const sent = drafts.snapshot('one')
    drafts.text.value = '新增内容'
    drafts.clearIfUnchanged('one', sent)
    expect(drafts.text.value).toBe('新增内容')
    const next = drafts.snapshot('one')
    conversation.value = 'two'
    drafts.text.value = '不能被误删'
    drafts.clearIfUnchanged('one', next)
    expect(drafts.text.value).toBe('不能被误删')
    conversation.value = 'one'
    expect(drafts.text.value).toBe('')
    await drafts.flush()
    const restarted = mount()
    await Promise.resolve()
    expect(restarted.drafts.text.value).toBe('')
  })

  it('retains an unsaved draft and reports a persistence failure', async () => {
    bridge.saveDraft.mockRejectedValue(new Error('disk full'))
    const { drafts } = mount()
    drafts.text.value = '不能丢失'
    await drafts.flush()
    expect(drafts.text.value).toBe('不能丢失')
    expect(drafts.error.value).toContain('保存失败')
  })
})
