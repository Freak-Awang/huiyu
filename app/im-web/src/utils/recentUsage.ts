/**
 * 最近使用记录工具
 *
 * 提供 localStorage 存储键名常量和缓存清理函数。
 * 用于管理"最近使用的表情"和"最近使用的贴纸"记录。
 */
export const RECENT_EMOJIS_KEY = 'im_recent_emojis'
export const RECENT_STICKERS_KEY = 'im_recent_stickers'

/** 清空最近使用的表情和贴纸缓存 */
export function clearRecentUsageCache() {
  localStorage.removeItem(RECENT_EMOJIS_KEY)
  localStorage.removeItem(RECENT_STICKERS_KEY)
}
