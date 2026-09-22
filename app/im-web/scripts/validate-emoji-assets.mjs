import { readFile, readdir, realpath } from 'node:fs/promises'
import { resolve, relative, isAbsolute, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = resolve(process.argv[2] || fileURLToPath(new URL('../public/emoji/builtin', import.meta.url)))
const categories = new Set(['smile'])
const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.v1.json'), 'utf8'))
const ids = new Set(), files = new Set(), orders = new Set(), counts = {}
function check(condition, description) { if (!condition) throw new Error(description) }
check(manifest.version === 1 && manifest.packId === 'builtin' && Array.isArray(manifest.items), 'Invalid manifest header')
for (const [index, item] of manifest.items.entries()) {
  check(/^builtin_emoji_\d{4}$/.test(item.id) && !ids.has(item.id), `Invalid/duplicate ID: ${item.id}`)
  check(categories.has(item.category), `Invalid category: ${item.category}`)
  check(Number.isSafeInteger(item.order) && item.order > 0 && !orders.has(item.order), `Invalid/duplicate order: ${item.id}`)
  check(item.order === index + 1, `Expected contiguous display order: ${item.id}`)
  check(typeof item.file === 'string' && new RegExp(`^images/${item.category}/[^/\\\\.]+\\.png$`).test(item.file) && !files.has(item.file), `Invalid/duplicate path: ${item.file}`)
  const path = await realpath(resolve(directory, item.file))
  const assetRelative = relative(directory, path)
  check(!isAbsolute(assetRelative) && assetRelative !== '..' && !assetRelative.startsWith(`..${sep}`), `Asset escapes pack: ${item.file}`)
  check(item.file === `images/smile/emoji_${String(item.order).padStart(4, '0')}.png`, `Expected consecutive filename matching display order: ${item.id}`)
  const bytes = await readFile(path)
  check(bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), `Not PNG: ${item.file}`)
  check(bytes.readUInt32BE(16) === 160 && bytes.readUInt32BE(20) === 160, `Expected 160x160: ${item.file}`)
  ids.add(item.id); files.add(item.file); orders.add(item.order)
  counts[item.category] = (counts[item.category] || 0) + 1
}
const actual = (await readdir(resolve(directory, 'images'), { recursive: true })).filter(path => path.toLowerCase().endsWith('.png'))
check(Number.isSafeInteger(manifest.total) && manifest.total > 0 && manifest.total === manifest.items.length && actual.length === manifest.total, 'Manifest total, item count and PNG count must agree')
check(actual.every(path => files.has(`images/${path.split(sep).join('/')}`)), 'PNG files must match the manifest exactly')
check(Array.isArray(manifest.categories) && manifest.categories.length === categories.size && new Set(manifest.categories.map(category => category.id)).size === categories.size, 'Unexpected manifest categories')
for (const category of manifest.categories) {
  check(categories.has(category.id) && Number.isSafeInteger(category.count) && counts[category.id] === category.count, `Unexpected category count: ${category.id}`)
}
const folders = await readdir(resolve(directory, 'images'), { withFileTypes: true })
check(folders.length === categories.size && folders.every(folder => folder.isDirectory() && categories.has(folder.name)), 'Only retained category folders may ship')
check((await readdir(directory)).every(name => ['images', 'manifest.v1.json'].includes(name)), 'Development documentation must not ship in the runtime pack')
console.log(JSON.stringify({ directory, emojiCount: ids.size, pngCount: actual.length, categories: counts, consecutiveFilenames: true, dimensions: '160x160' }, null, 2))
