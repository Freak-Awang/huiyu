// ?????emoji groups static UI data that is reused across chat interactions.
export interface EmojiGroup {
  name: string
  emojis: string[]
}

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    name: '常用',
    emojis: ['😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '😭', '😡', '👍', '🙏'],
  },
  {
    name: '表情',
    emojis: ['😃', '😄', '😆', '😉', '😋', '😜', '🤔', '😴', '😅', '😇', '🥳', '😤'],
  },
  {
    name: '手势',
    emojis: ['👍', '👎', '👌', '✌️', '👏', '🙌', '🤝', '🙏', '💪', '👋', '🤙', '🫶'],
  },
  {
    name: '符号',
    emojis: ['❤️', '💔', '💕', '✨', '🔥', '🎉', '✅', '❌', '⭐', '💡', '📌', '☕'],
  },
]
