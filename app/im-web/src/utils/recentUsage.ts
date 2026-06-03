export const RECENT_EMOJIS_KEY = 'im_recent_emojis'
export const RECENT_STICKERS_KEY = 'im_recent_stickers'

export function clearRecentUsageCache() {
  localStorage.removeItem(RECENT_EMOJIS_KEY)
  localStorage.removeItem(RECENT_STICKERS_KEY)
}
