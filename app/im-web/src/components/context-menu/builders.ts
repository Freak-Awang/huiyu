import type { Message } from '../../api/message'
import type { Conversation, ConversationMember } from '../../api/conversation'
import type { ContextMenuItem } from './types'
import imageIcon from '../../assets/icons/图片.svg'
import folderIcon from '../../assets/icons/文件夹.svg'
import pinIcon from '../../assets/icons/置顶.svg'

export type MenuAction = () => void | Promise<unknown>
export type MessageCommand = 'reply' | 'copy' | 'forward' | 'favorite' | 'select' | 'recall' | 'delete' | 'view' | 'copyImage' | 'save' | 'open' | 'reveal' | 'download' | 'copyLink' | 'openLink' | 'retry'
export interface MessageMenuContext {
  message: Message
  selectedText?: string
  canRecall: boolean
  favorite?: boolean
  link?: string | null
  actions: Partial<Record<MessageCommand, MenuAction>>
}
function command(id: string, label: string, action?: MenuAction, extra: Partial<ContextMenuItem> = {}): ContextMenuItem {
  return { id, label, action, visible: !!action, ...extra }
}
function messageCommand(context: MessageMenuContext, id: MessageCommand, label: string, separatorBefore = false, danger = false) {
  return command(id, label, context.actions[id], { separatorBefore, danger, icon: id === 'view' ? imageIcon : id === 'reveal' ? folderIcon : undefined })
}
function tail(context: MessageMenuContext) {
  return [
    { ...messageCommand(context, 'recall', '撤回', true, true), visible: context.canRecall && !!context.actions.recall },
    messageCommand(context, 'delete', '删除', !context.canRecall, true),
  ]
}
function sharing(context: MessageMenuContext, includeReply = true) {
  return [
    ...(includeReply ? [messageCommand(context, 'reply', '回复')] : []),
    messageCommand(context, 'forward', '转发'),
    messageCommand(context, 'favorite', context.favorite ? '取消收藏' : '收藏'),
    messageCommand(context, 'select', '多选'),
  ]
}
export function buildImageContextMenu(context: MessageMenuContext): ContextMenuItem[] {
  return [messageCommand(context, 'view', '查看大图'), messageCommand(context, 'copyImage', '复制图片'),
    messageCommand(context, 'reply', '回复', true), messageCommand(context, 'forward', '转发'),
    messageCommand(context, 'save', '另存为'), messageCommand(context, 'favorite', context.favorite ? '取消收藏' : '收藏'),
    messageCommand(context, 'select', '多选'), ...tail(context)]
}
export function buildFileContextMenu(context: MessageMenuContext): ContextMenuItem[] {
  return [messageCommand(context, 'open', '打开文件'), messageCommand(context, 'reveal', '打开文件所在位置'),
    messageCommand(context, 'download', '下载文件'), messageCommand(context, 'save', '另存为', true),
    messageCommand(context, 'forward', '转发'), messageCommand(context, 'select', '多选'), ...tail(context)]
}
export function buildMessageContextMenu(context: MessageMenuContext): ContextMenuItem[] {
  const { message } = context
  if (message.status === 'RECALLED') return [messageCommand(context, 'delete', '删除', false, true)]
  if (!message.messageId || ['SENDING', 'FAILED'].includes(message.status || '')) {
    return [messageCommand(context, 'copy', '复制'),
      { ...messageCommand(context, 'retry', '重新发送'), visible: message.status === 'FAILED' && !!context.actions.retry },
      { ...messageCommand(context, 'delete', '删除', true, true), visible: message.status !== 'SENDING' && !!context.actions.delete }]
  }
  if (context.selectedText) return [messageCommand(context, 'copy', '复制'), ...sharing(context), ...tail(context)]
  if (message.messageType === 'IMAGE') return buildImageContextMenu(context)
  if (message.messageType === 'FILE' || message.messageType === 'FOLDER') return buildFileContextMenu(context)
  if (context.link) return [messageCommand(context, 'openLink', '打开链接'), messageCommand(context, 'copyLink', '复制链接'),
    messageCommand(context, 'reply', '回复', true), ...sharing(context, false), ...tail(context)]
  return [messageCommand(context, 'reply', '回复'), messageCommand(context, 'copy', '复制'), ...sharing(context, false), ...tail(context)]
}

export function buildConversationContextMenu(conversation: Conversation, unread: number, actions: Partial<Record<'read' | 'unread' | 'pin' | 'mute' | 'window' | 'clear' | 'delete', MenuAction>>): ContextMenuItem[] {
  return [command(unread ? 'read' : 'unread', unread ? '标为已读' : '标为未读', unread ? actions.read : actions.unread),
    command('pin', conversation.pinned ? '取消置顶' : '置顶', actions.pin, { icon: pinIcon }),
    command('mute', conversation.muted ? '取消消息免打扰' : '消息免打扰', actions.mute),
    command('window', '独立窗口打开', actions.window, { separatorBefore: true }),
    command('clear', '清空聊天记录', actions.clear, { separatorBefore: !actions.window, danger: true }),
    command('delete', '删除会话', actions.delete, { danger: true })]
}

export function memberPermissions(conversation: Conversation, userId: string, member: ConversationMember) {
  const current = conversation.members?.find(item => item.userId === userId)
  const other = !!current && member.userId !== userId && member.role !== 'owner'
  return {
    manageRole: other && current.role === 'owner',
    remove: other && (current.role === 'owner' || (current.role === 'admin' && (member.role || 'member') === 'member')),
  }
}
export function buildMemberContextMenu(conversation: Conversation, userId: string, member: ConversationMember,
  actions: Partial<Record<'mention' | 'profile' | 'chat' | 'role' | 'remove' | 'transfer', MenuAction>>): ContextMenuItem[] {
  const self = member.userId === userId
  const permission = memberPermissions(conversation, userId, member)
  return [command('mention', '@TA', self ? undefined : actions.mention), command('profile', '查看资料', actions.profile),
    command('chat', '私聊', self ? undefined : actions.chat),
    command('role', member.role === 'admin' ? '取消管理员' : '设为管理员', permission.manageRole ? actions.role : undefined, { separatorBefore: true }),
    command('transfer', '转让群主', permission.manageRole ? actions.transfer : undefined),
    command('remove', '移出群聊', permission.remove ? actions.remove : undefined, { danger: true, separatorBefore: !permission.manageRole })]
}
export function buildFriendContextMenu(self: boolean, actions: Partial<Record<'chat' | 'profile' | 'remark' | 'delete', MenuAction>>): ContextMenuItem[] {
  return [command('chat', '发送消息', self ? undefined : actions.chat), command('profile', '查看资料', actions.profile),
    command('remark', '修改备注', self ? undefined : actions.remark), command('delete', '删除好友', self ? undefined : actions.delete, { separatorBefore: true, danger: true })]
}
export type InputCommand = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll'
export function buildInputContextMenu(enabled: Record<InputCommand, boolean>, action: (command: InputCommand) => void | Promise<unknown>): ContextMenuItem[] {
  const labels: Record<InputCommand, string> = { undo: '撤销', redo: '重做', cut: '剪切', copy: '复制', paste: '粘贴', selectAll: '全选' }
  const shortcuts: Record<InputCommand, string> = { undo: 'Ctrl+Z', redo: 'Ctrl+Y', cut: 'Ctrl+X', copy: 'Ctrl+C', paste: 'Ctrl+V', selectAll: 'Ctrl+A' }
  return (Object.keys(labels) as InputCommand[]).map(id => ({ id, label: labels[id], disabled: !enabled[id], shortcut: shortcuts[id],
    separatorBefore: id === 'cut' || id === 'selectAll', action: () => action(id) }))
}

/** Validate both here and in the main process; never pass message content directly to shell. */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value.trim())) return null
  try {
    const url = new URL(value.trim())
    return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password ? url.href : null
  } catch { return null }
}
