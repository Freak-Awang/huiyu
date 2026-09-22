export type EmojiCategory = 'smile'
export type EmojiPickerCategory = EmojiCategory | 'recent'

export interface BuiltinEmoji {
  id: string
  category: EmojiCategory
  order: number
  file: string
  label: string | null
  unicode: string | null
  keywords: string[]
}
export interface EmojiManifest { version: number; packId: string; items: BuiltinEmoji[] }
export interface EmojiTextSegment { type: 'text'; text: string }
export interface EmojiImageSegment { type: 'emoji'; id: string }
export type EmojiMessageSegment = EmojiTextSegment | EmojiImageSegment
export interface EmojiCatalog {
  byId: ReadonlyMap<string, BuiltinEmoji>
  byCategory: ReadonlyMap<EmojiCategory, readonly BuiltinEmoji[]>
}

/** The editor exposes serialized offsets so existing mention/menu code stays text-based. */
export interface EmojiComposerHandle {
  readonly element: HTMLDivElement | null
  readonly value: string
  readonly disabled: boolean
  readonly selectionStart: number
  readonly selectionEnd: number
  readonly canUndo: boolean
  readonly canRedo: boolean
  focus(options?: FocusOptions): void
  setSelectionRange(start: number, end: number): void
  select(): void
  insertText(text: string): void
  insertEmoji(emoji: BuiltinEmoji): void
  undo(): void
  redo(): void
  saveRange(): void
}
