/**
 * 最近使用记录工具
 *
 * 提供 localStorage 存储键名常量和缓存清理函数。
 * 管理内置 Emoji 的最近使用记录，并在清理时移除旧版本遗留键。
 */
import { clearRecentEmoji } from '../features/emoji/composables/useRecentEmoji'

/** 清空最近使用的表情缓存及旧版本遗留记录。 */
export function clearRecentUsageCache() {
  clearRecentEmoji()
  localStorage.removeItem('im_recent_emojis')
  localStorage.removeItem('im_recent_stickers')
}
