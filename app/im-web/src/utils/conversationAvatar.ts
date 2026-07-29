import defaultGroupAvatar from '../assets/default-group-avatar.svg'

export { defaultGroupAvatar }

export function resolveConversationAvatarSource(
  type: 'SINGLE' | 'GROUP',
  source = '',
  customSourceFailed = false,
  defaultSourceFailed = false,
): string {
  if (source && !customSourceFailed) return source
  if (type === 'GROUP' && !defaultSourceFailed) return defaultGroupAvatar
  return ''
}

export function getConversationAvatarFallback(
  type: 'SINGLE' | 'GROUP',
  name = '',
): string {
  return type === 'GROUP' ? '群' : (name || 'U').slice(0, 1)
}
