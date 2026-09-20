import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import { type Conversation, type ConversationMember, pinConversation, muteConversation } from '../../api/conversation'
import type { Message } from '../../api/message'
import { useAuthStore } from '../../stores/auth'
import { useChatStore } from '../../stores/chat'
import { useMessagePolicyStore } from '../../stores/messagePolicy'
import { useMessageLibraryStore, messageIdentity } from '../../stores/messageLibrary'
import { useP2pTransferStore } from '../../stores/p2pTransfers'
import type { UserProfileSnapshot } from '../../stores/userProfiles'
import { buildMessageContextMenu, buildConversationContextMenu, buildMemberContextMenu, buildFriendContextMenu, buildInputContextMenu, safeHttpUrl, type MessageCommand, type MenuAction, type InputCommand } from './builders'
import { openContextMenu, closeContextMenu, selectedMessageText } from './useContextMenu'
import { copyMessageText, copyMessageImage, saveMessageImage, openMessageLink } from '../../utils/messageMenuActions'
import { parseP2pAttachmentContent } from '../../utils/p2pProtocol'
import type { EmojiComposerHandle } from '../../features/emoji/types'

interface ChatMenuActions {
  input: Ref<EmojiComposerHandle | null>
  reply: (message: Message) => void
  recall: (message: Message) => Promise<void>
  retry: (message: Message) => void
  viewImage: (message: Message) => void | Promise<void>
  download: (message: Message) => Promise<void>
  profile: (user: UserProfileSnapshot) => void | Promise<void>
  chat: (user: UserProfileSnapshot) => Promise<void>
  mention: (member: ConversationMember) => void
  role: (member: ConversationMember) => Promise<void>
  remove: (member: ConversationMember) => Promise<void>
  transfer: (member: ConversationMember) => Promise<void>
  forward: (message: Message, target: Conversation) => Promise<void>
  feedback: (text: string, error?: boolean) => void
}

export function useChatContextMenus(actions: ChatMenuActions) {
  const auth = useAuthStore()
  const chat = useChatStore()
  const policy = useMessagePolicyStore()
  const library = useMessageLibraryStore()
  const transfers = useP2pTransferStore()
  const selecting = ref(false)
  const selected = ref(new Set<string>())
  const forwardMessages = ref<Message[]>([])
  const forwarding = ref(false)
  const showFavorites = ref(false)
  const selectedMessages = computed(() => chat.currentMessages.filter(message => selected.value.has(messageIdentity(message))))
  const hasFilesToForward = computed(() => forwardMessages.value.some(message => ['FILE', 'FOLDER'].includes(message.messageType)))
  const targetConversations = computed(() => chat.conversations.filter(conversation => !hasFilesToForward.value || conversation.type === 'SINGLE'))
  const userId = () => auth.currentUser?.userId || ''
  const latest = (message: Message) => chat.messages.get(message.conversationId)?.find(item => messageIdentity(item) === messageIdentity(message)) || message
  function canShare(message: Message) {
    if (!message.messageId || ['RECALLED', 'FAILED', 'SENDING'].includes(message.status || '')) return false
    if (['TEXT', 'IMAGE'].includes(message.messageType)) return true
    const state = fileState(message)
    return !!window.imDesktop?.sourceFromP2pTask && !!state && (state.direction === 'send' && !!state.sourceId || state.direction === 'receive' && state.status === 'completed' && !!state.localPath)
  }
  function fileState(message: Message) {
    const info = parseP2pAttachmentContent(message.content)
    return info ? transfers.stateFor(info.transferId) : undefined
  }
  function cancelSelection() { selecting.value = false; selected.value = new Set() }
  function toggleSelected(message: Message) {
    const key = messageIdentity(message)
    if (selected.value.has(key)) selected.value.delete(key)
    else if (selected.value.size < 100) selected.value.add(key)
    else actions.feedback('一次最多选择 100 条消息', true)
  }
  function startSelection(message: Message) { selecting.value = true; selected.value = new Set([messageIdentity(message)]) }
  function requestForward(messages: Message[]) {
    if (!messages.length || !messages.every(message => canShare(latest(message)))) throw new Error('选中的消息包含未发送、已撤回或本机文件不可用的消息')
    forwardMessages.value = messages.map(message => ({ ...latest(message) }))
  }
  async function confirmForward(target: Conversation) {
    if (forwarding.value) return
    const account = userId()
    forwarding.value = true
    try {
      while (forwardMessages.value.length) {
        if (userId() !== account) throw new Error('账号已切换，转发已停止')
        const message = latest(forwardMessages.value[0]!)
        if (!canShare(message)) throw new Error('消息状态已改变，转发已停止')
        await actions.forward(message, target)
        forwardMessages.value = forwardMessages.value.slice(1)
      }
      cancelSelection()
      actions.feedback('已提交转发，可在目标会话查看发送状态')
    } catch (error) { actions.feedback(error instanceof Error ? error.message : '转发失败，未提交的消息已保留', true) }
    finally { forwarding.value = false }
  }
  async function deleteMessages(messages: Message[]) {
    if (!messages.length) return
    if (messages.some(message => latest(message).status === 'SENDING')) throw new Error('请等待消息发送结束后再删除')
    if (messages.length > 1 && !window.confirm(`删除本机的 ${messages.length} 条消息？其他成员仍可查看。`)) return
    await library.update('delete', messages)
    cancelSelection()
    actions.feedback('已删除本机消息，其他成员的记录不受影响')
  }
  async function favoriteMessages(messages: Message[], remove = false) {
    if (!messages.length) return
    if (!remove && messages.some(message => ['RECALLED', 'FAILED', 'SENDING'].includes(latest(message).status || ''))) throw new Error('未发送或已撤回的消息不能收藏')
    await library.update(remove ? 'unfavorite' : 'favorite', messages.map(latest))
    actions.feedback(remove ? '已取消收藏' : '已保存到本机收藏')
  }
  function openMessageMenu(event: MouseEvent, original: Message) {
    const element = event.currentTarget as HTMLElement
    const selection = selectedMessageText(element)
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
    const account = userId()
    openContextMenu(event, () => {
      const message = latest(original)
      const link = safeHttpUrl(anchor?.getAttribute('href') || (message.messageType === 'TEXT' ? message.displayContent : ''))
      const state = fileState(message)
      const localFile = !!state && (state.direction === 'receive' && state.status === 'completed' && !!state.localPath || state.direction === 'send' && !!state.sourceId)
      const taskId = state?.taskId || state?.transferId || ''
      const commands: Partial<Record<MessageCommand, MenuAction>> = {
        reply: () => actions.reply(latest(message)),
        select: () => startSelection(message),
        recall: () => { if (!policy.canRecall(latest(message), userId())) throw new Error('该消息已超过撤回期限或状态已改变'); return actions.recall(message) },
        retry: () => actions.retry(message),
        ...(selection || message.messageType === 'TEXT' ? { copy: () => copyMessageText(selection || message.displayContent) } : {}),
        ...(canShare(message) ? { forward: () => requestForward([message]) } : {}),
        ...(library.ready ? { delete: () => deleteMessages([message]), favorite: () => favoriteMessages([message], library.isFavorite(message)) } : {}),
      }
      if (message.messageType === 'IMAGE') {
        commands.view = () => actions.viewImage(message)
        commands.copyImage = () => copyMessageImage(message)
        if (window.imDesktop?.saveImageAs) commands.save = () => saveMessageImage(message)
      }
      if (link) { commands.openLink = () => openMessageLink(link); commands.copyLink = () => copyMessageText(link) }
      if (localFile) {
        commands.open = async () => { const result = await window.imDesktop?.openP2pResult?.(taskId); if (!result?.success) throw new Error(result?.error || '打开文件失败') }
        commands.reveal = async () => { const result = await window.imDesktop?.revealP2pResult?.(taskId); if (!result?.success) throw new Error(result?.error || '打开文件位置失败') }
        if (message.messageType === 'FILE' && window.imDesktop?.saveP2pAs) commands.save = () => window.imDesktop!.saveP2pAs!(taskId)
      } else if (parseP2pAttachmentContent(message.content) && message.senderId !== userId() && transfers.desktopSupported
        && (!state || ['waiting', 'paused', 'failed', 'cancelled', 'unavailable'].includes(state.status))) commands.download = () => actions.download(message)
      for (const id of Object.keys(commands) as MessageCommand[]) {
        const run = commands[id]!
        commands[id] = () => { if (userId() !== account) throw new Error('账号已切换'); return run() }
      }
      return buildMessageContextMenu({ message, selectedText: selection, canRecall: policy.canRecall(message, userId()), favorite: library.isFavorite(message), link, actions: commands })
    }, '消息操作')
  }
  function openConversationMenu(event: MouseEvent, conversation: Conversation) {
    const id = conversation.conversationId
    openContextMenu(event, () => {
      const current = chat.conversations.find(item => item.conversationId === id) || conversation
      return buildConversationContextMenu(current, chat.getUnreadCount(id), {
        read: async () => { if (!await chat.markAsRead(id)) throw new Error('标为已读失败，请重试') },
        pin: async () => { const pinned = !current.pinned; await pinConversation(id, pinned); const updated = chat.conversations.find(item => item.conversationId === id); if (updated) updated.pinned = pinned },
        mute: async () => { const muted = !current.muted; await muteConversation(id, muted); const updated = chat.conversations.find(item => item.conversationId === id); if (updated) updated.muted = muted },
      })
    }, '会话操作')
  }
  function openMemberMenu(event: MouseEvent, member: ConversationMember) {
    const id = chat.currentConversation?.conversationId
    if (!id) return
    openContextMenu(event, () => {
      const conversation = chat.currentConversation
      if (!conversation || conversation.conversationId !== id) return []
      const current = conversation.members?.find(item => item.userId === member.userId) || member
      return buildMemberContextMenu(conversation, userId(), current, {
        mention: () => actions.mention(current), profile: () => actions.profile(current), chat: () => actions.chat(current),
        role: () => actions.role(current), remove: () => actions.remove(current), transfer: () => actions.transfer(current),
      })
    }, '群成员操作')
  }
  function openUserMenu(event: MouseEvent, user: UserProfileSnapshot) {
    const targetId = String(user.userId ?? user.id ?? '')
    const member = chat.currentConversation?.type === 'GROUP' ? chat.currentConversation.members?.find(item => item.userId === targetId) : null
    if (member && (event.currentTarget as HTMLElement).classList.contains('message-avatar')) return openMemberMenu(event, member)
    openContextMenu(event, buildFriendContextMenu(targetId === userId(), { profile: () => actions.profile(user), chat: () => actions.chat(user) }), '联系人操作')
  }
  function openInputMenu(event: MouseEvent) {
    const input = actions.input.value
    if (!input) return
    const start = input.selectionStart, end = input.selectionEnd
    const conversationId = chat.currentConversation?.conversationId
    const hasSelection = start !== end
    const editable = !input.disabled
    const enabled = ref({ undo: editable && input.canUndo, redo: editable && input.canRedo,
      cut: editable && hasSelection, copy: hasSelection, paste: false, selectAll: !!input.value.length })
    // Native clipboard inspection is local IPC, never a server request. Keep the menu visible while it resolves.
    void window.imDesktop?.clipboardState?.().then(state => { enabled.value.paste = editable && (state.text || state.image) }).catch(() => undefined)
    const run = async (command: InputCommand) => {
      if (chat.currentConversation?.conversationId !== conversationId || !input.element?.isConnected) return
      input.focus({ preventScroll: true })
      input.setSelectionRange(start, end)
      if (command === 'selectAll') { input.select(); return }
      if (command === 'undo') { input.undo(); return }
      if (command === 'redo') { input.redo(); return }
      if (command === 'copy') { await copyMessageText(input.value.slice(start, end)); return }
      if (command === 'cut') { await copyMessageText(input.value.slice(start, end)); input.insertText(''); return }
      if (window.imDesktop?.editCommand) { await window.imDesktop.editCommand(command); return }
      if (!document.execCommand(command)) throw new Error('浏览器未允许此操作，请使用键盘快捷键')
    }
    openContextMenu(event, () => buildInputContextMenu(enabled.value, run), '文本编辑')
  }
  watch(() => chat.currentConversation?.conversationId, () => { closeContextMenu(); cancelSelection() }, { flush: 'sync' })
  watch(() => auth.currentUser?.userId, () => { closeContextMenu(); cancelSelection(); forwardMessages.value = []; showFavorites.value = false; library.reset(); policy.reset() })
  onUnmounted(() => { closeContextMenu(); library.reset(); policy.reset() })
  return { library, policy, selecting, selected, selectedMessages, forwardMessages, forwarding, showFavorites, targetConversations,
    openMessageMenu, openConversationMenu, openMemberMenu, openUserMenu, openInputMenu, toggleSelected, cancelSelection,
    requestForward, confirmForward, deleteMessages, favoriteMessages, canShare }
}
