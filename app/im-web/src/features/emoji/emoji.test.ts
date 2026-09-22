/// <reference types="node" />
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parseEmojiMessage } from './utils/emojiParser'
import { emojiMessageSize, emojiToPlainText, isEmojiOnlyMessage, serializeEmojiSegments } from './utils/emojiMessage'
import { getBuiltinEmojiUrl } from './utils/emojiUrl'
import { emojiGridWindow } from './utils/emojiVirtualGrid'
import { addRecentEmoji, normalizeRecentEmoji } from './composables/useRecentEmoji'
import { createEmojiCatalog } from './composables/useEmojiCatalog'
import type { EmojiManifest } from './types'

const manifest = JSON.parse(readFileSync(new URL('../../../public/emoji/builtin/manifest.v1.json', import.meta.url), 'utf8')) as EmojiManifest
const renameAudit = JSON.parse(readFileSync(new URL('../../../docs/emoji/rename-2026-09-21.json', import.meta.url), 'utf8')) as {
  entries: { id: string; file: string; order: number; sha256: string }[]
}
const token = '[emoji:builtin_emoji_0001]'

describe('Emoji parser and segment serialization', () => {
  it.each(['', '纯文本 😀\nhttps://example.test', '<img src=x onerror=alert(1)>', '[emoji:../../secret]', '[emoji:x]', '[emoji:builtin_emoji_1]', '[emoji:builtin_emoji_12345]', '[emoji:builtin_emoji_0001', '[emoji:BUILTIN_EMOJI_0001]'])('keeps ordinary/illegal/incomplete text unchanged: %s', text => {
    const parsed = parseEmojiMessage(text)
    expect(parsed).toEqual(text ? [{ type: 'text', text }] : [])
    expect(serializeEmojiSegments(parsed)).toBe(text)
  })
  it('parses text on both sides and adjacent tokens', () => {
    expect(parseEmojiMessage(`abc${token}${token}def`)).toEqual([
      { type: 'text', text: 'abc' }, { type: 'emoji', id: 'builtin_emoji_0001' },
      { type: 'emoji', id: 'builtin_emoji_0001' }, { type: 'text', text: 'def' },
    ])
  })
  it.each([token, `${token}${token}`, `你好 ${token}\n今天 ${token}`, '[emoji:builtin_emoji_9999]', '[emoji:builtin_emoji_0674]', '[emoji:builtin_emoji_0812]', '[emoji:builtin_emoji_0118]'])('round trips valid and unknown IDs: %s', text => {
    expect(serializeEmojiSegments(parseEmojiMessage(text))).toBe(text)
    expect(emojiToPlainText(text)).not.toContain('builtin_emoji')
  })
  it('never serializes an arbitrary path as a token', () => {
    expect(serializeEmojiSegments([{ type: 'emoji', id: '../../file' }])).toBe('[表情]')
  })
})

describe('Emoji-only sizing', () => {
  it.each([[token, '48px'], [token.repeat(2), '40px'], [token.repeat(3), '40px'], [token.repeat(4), '32px'], [` \n${token} \t`, '48px']])('sizes %s as %s', (text, size) => {
    expect(isEmojiOnlyMessage(text!)).toBe(true)
    expect(emojiMessageSize(text!)).toBe(size)
  })
  it.each(['', ' \n', '😀', `你好${token}`])('keeps inline text sizing: %s', text => {
    expect(isEmojiOnlyMessage(text)).toBe(false)
    expect(emojiMessageSize(text)).toBe('1.35em')
  })
})

describe('Recent Emoji', () => {
  const exists = (id: string) => /^builtin_emoji_\d{4}$/.test(id) && id !== 'builtin_emoji_9999'
  it('adds, deduplicates and moves existing IDs to the front', () => {
    let result = addRecentEmoji([], 'builtin_emoji_0001', exists)
    result = addRecentEmoji(result, 'builtin_emoji_0028', exists)
    result = addRecentEmoji(result, 'builtin_emoji_0001', exists)
    expect(result).toEqual(['builtin_emoji_0001', 'builtin_emoji_0028'])
  })
  it('caps at 40 and filters malformed or removed IDs', () => {
    const ids = Array.from({ length: 45 }, (_, index) => `builtin_emoji_${String(index + 1).padStart(4, '0')}`)
    expect(normalizeRecentEmoji([null, 1, {}, 'builtin_emoji_9999', ...ids, ids[0]], exists)).toEqual(ids.slice(0, 40))
    expect(normalizeRecentEmoji({}, exists)).toEqual([])
  })
  it('filters deleted IDs but retains recents moved from other categories', () => {
    const catalog = createEmojiCatalog(manifest)
    expect(normalizeRecentEmoji(['builtin_emoji_0812', 'builtin_emoji_0001', 'builtin_emoji_0118', 'builtin_emoji_0346', 'builtin_emoji_3833', 'builtin_emoji_0549', 'builtin_emoji_3569'], id => catalog.byId.has(id)))
      .toEqual(['builtin_emoji_0001', 'builtin_emoji_0346', 'builtin_emoji_0549', 'builtin_emoji_3569'])
  })
})

describe('Manifest catalog and resource URLs', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
  it('indexes only manifest IDs and preserves category order, including the 674 gap', () => {
    const result = createEmojiCatalog(manifest)
    expect(result.byId.size).toBe(manifest.items.length)
    expect(result.byId.has('builtin_emoji_0674')).toBe(false)
    expect(result.byId.has('builtin_emoji_3841')).toBe(false)
    expect(result.byId.has('builtin_emoji_0812')).toBe(false)
    expect(result.byId.has('builtin_emoji_3833')).toBe(false)
    expect([...result.byCategory.keys()]).toEqual(['smile'])
    expect(result.byCategory.get('smile')).toHaveLength(manifest.items.length)
    expect(Object.isFrozen(result.byCategory.get('smile'))).toBe(true)
  })
  it('preserves every audited ID, content hash and display order after renaming', () => {
    const result = createEmojiCatalog(manifest)
    expect(manifest.items.map(item => item.id)).toEqual(renameAudit.entries.map(entry => entry.id))
    for (const entry of renameAudit.entries) {
      expect(result.byId.get(entry.id)).toMatchObject({ category: 'smile', file: entry.file, order: entry.order })
      const bytes = readFileSync(new URL(`../../../public/emoji/builtin/${entry.file}`, import.meta.url))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256)
    }
  })
  it('does not infer message IDs from the new consecutive filenames', () => {
    const result = createEmojiCatalog(manifest)
    expect(result.byId.get('builtin_emoji_0346')).toMatchObject({ file: 'images/smile/emoji_0121.png', order: 121 })
    expect(result.byId.get('builtin_emoji_0549')).toMatchObject({ file: 'images/smile/emoji_0128.png', order: 128 })
    expect(result.byId.get('builtin_emoji_0127')).toMatchObject({ file: 'images/smile/emoji_0118.png', order: 118 })
    expect(result.byId.has('builtin_emoji_0118')).toBe(false)
    expect(result.byId.has('builtin_emoji_0121')).toBe(false)
  })
  it('rejects duplicate IDs, paths, invalid categories and path traversal', () => {
    const first = manifest.items[0]!
    for (const item of [{ ...first }, { ...first, id: 'builtin_emoji_0002' }, { ...first, category: 'unknown' }, { ...first, file: 'images/smile/../../secret.png' }, { ...first, order: NaN }]) {
      expect(() => createEmojiCatalog({ ...manifest, items: [first, item] })).toThrow()
    }
  })
  it.each(['./', '/', '/client/'])('uses the configured Vite base %s', base => {
    expect(getBuiltinEmojiUrl('images/smile/emoji_0001.png', base)).toBe(`${base}emoji/builtin/images/smile/emoji_0001.png`)
  })
  it('rejects external URLs and remains relative to packaged index.html', () => {
    expect(() => getBuiltinEmojiUrl('https://bad.test/a.png')).toThrow()
    expect(new URL(getBuiltinEmojiUrl('images/smile/emoji_0001.png', './'), 'file:///C:/App/dist/index.html').href).toBe('file:///C:/App/dist/emoji/builtin/images/smile/emoji_0001.png')
  })
  it.each(['food', 'nature', 'new', 'object', 'people', 'travel', 'activity', 'symbol', 'flag'])('rejects paths in deleted category %s', category => {
    expect(() => getBuiltinEmojiUrl(`images/${category}/emoji_0001.png`)).toThrow()
  })
  it('shares one in-flight request and caches its result', async () => {
    vi.resetModules()
    vi.stubGlobal('window', { location: { protocol: 'http:' } })
    const fetch = vi.fn(async () => ({ ok: true, json: async () => manifest }))
    vi.stubGlobal('fetch', fetch)
    const { loadEmojiCatalog, getEmojiById, getEmojisByCategory, hasEmoji } = await import('./composables/useEmojiCatalog')
    const a = loadEmojiCatalog(), b = loadEmojiCatalog()
    expect(a).toBe(b)
    await a
    expect(loadEmojiCatalog()).toBe(a)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(getEmojiById('builtin_emoji_0001')?.file).toBe(manifest.items[0]?.file)
    expect(getEmojisByCategory('smile')).toHaveLength(manifest.items.length)
    expect(hasEmoji('builtin_emoji_0674')).toBe(false)
  })
  it('uses the fixed Electron bridge for file pages', async () => {
    vi.resetModules()
    const bridge = vi.fn(async () => manifest), fetch = vi.fn()
    vi.stubGlobal('window', { location: { protocol: 'file:' }, imDesktop: { loadBuiltinEmojiManifest: bridge } })
    vi.stubGlobal('fetch', fetch)
    const { loadEmojiCatalog } = await import('./composables/useEmojiCatalog')
    expect((await loadEmojiCatalog()).byId.size).toBe(manifest.items.length)
    expect(bridge).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('shares failure without retry storms or publishing a partial catalog', async () => {
    vi.resetModules()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal('window', { location: { protocol: 'http:' } })
    const fetch = vi.fn(async () => { throw new Error('offline') })
    vi.stubGlobal('fetch', fetch)
    const { loadEmojiCatalog, useEmojiCatalog } = await import('./composables/useEmojiCatalog')
    await expect(loadEmojiCatalog()).rejects.toThrow('offline')
    await expect(loadEmojiCatalog()).rejects.toThrow('offline')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(useEmojiCatalog().error.value).toBe('表情资源加载失败')
    expect(useEmojiCatalog().catalog.value).toBeNull()
  })
})

describe('Fixed-size virtual grid', () => {
  it('limits a large synthetic grid and covers the first, middle and last rows', () => {
    for (const top of [0, 5000, 1e6]) {
      const view = emojiGridWindow(2319, 368, 300, top)
      expect(view.end - view.start).toBeLessThanOrEqual(128)
      expect(view.columns).toBe(8)
      expect(view.totalHeight).toBe(Math.ceil(2319 / 8) * 44)
    }
    expect(emojiGridWindow(2319, 368, 300, 1e6).end).toBe(2319)
  })
  it('handles resizing, empty categories and very narrow windows', () => {
    expect(emojiGridWindow(0, 0, 300, 100)).toMatchObject({ start: 0, end: 0, columns: 1, totalHeight: 0 })
    expect(emojiGridWindow(40, 220, 300, 0).columns).toBe(5)
  })
})
