/**
 * 会话头像工具
 *
 * 提供会话头像的解析与回退逻辑：
 * - 群聊：优先自定义头像，加载失败回退到默认群头像，再失败显示文字回退
 * - 单聊：优先对方头像，加载失败显示首字回退
 */
import defaultGroupAvatar from '../assets/default-group-avatar.svg'

export { defaultGroupAvatar }

/**
 * 解析会话头像最终展示 URL
 * @param type - 会话类型：SINGLE（单聊）或 GROUP（群聊）
 * @param source - 自定义头像 URL
 * @param customSourceFailed - 自定义头像是否加载失败
 * @param defaultSourceFailed - 默认头像是否加载失败
 * @returns 最终使用的头像 URL，空字符串表示使用文字回退
 */
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

/**
 * 获取会话头像文字回退（首字）
 * @param type - 会话类型
 * @param name - 会话/用户名称
 * @returns 群聊返回"群"，单聊返回名称首字
 */
export function getConversationAvatarFallback(
  type: 'SINGLE' | 'GROUP',
  name = '',
): string {
  return type === 'GROUP' ? '群' : (name || 'U').slice(0, 1)
}
