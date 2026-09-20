import { readFile, readdir, realpath } from 'node:fs/promises'
import { resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = resolve(process.argv[2] || fileURLToPath(new URL('../public/emoji/builtin', import.meta.url)))
const expectedCounts = { smile: 129, symbol: 260, activity: 78, flag: 269 }
const categories = new Set(Object.keys(expectedCounts))
const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.v1.json'), 'utf8'))
const ids = new Set(), files = new Set(), orders = new Set(), counts = {}
function check(condition, description) { if (!condition) throw new Error(description) }
check(manifest.version === 1 && manifest.packId === 'builtin' && Array.isArray(manifest.items), 'Invalid manifest header')
for (const item of manifest.items) {
  check(/^builtin_emoji_\d{4}$/.test(item.id) && !ids.has(item.id), `Invalid/duplicate ID: ${item.id}`)
  check(categories.has(item.category), `Invalid category: ${item.category}`)
  check(Number.isSafeInteger(item.order) && item.order > 0 && !orders.has(item.order), `Invalid/duplicate order: ${item.id}`)
  check(typeof item.file === 'string' && new RegExp(`^images/${item.category}/[^/\\\\.]+\\.png$`).test(item.file) && !files.has(item.file), `Invalid/duplicate path: ${item.file}`)
  const path = await realpath(resolve(directory, item.file))
  check(!relative(directory, path).startsWith(`..${sep}`), `Asset escapes pack: ${item.file}`)
  const bytes = await readFile(path)
  check(bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), `Not PNG: ${item.file}`)
  check(bytes.readUInt32BE(16) === 160 && bytes.readUInt32BE(20) === 160, `Expected 160x160: ${item.file}`)
  ids.add(item.id); files.add(item.file); orders.add(item.order)
  counts[item.category] = (counts[item.category] || 0) + 1
}
const actual = (await readdir(resolve(directory, 'images'), { recursive: true })).filter(path => path.toLowerCase().endsWith('.png'))
check(manifest.total === 736 && manifest.items.length === 736 && actual.length === 736, 'V1 must contain 736 manifest entries and PNGs')
check(actual.every(path => files.has(`images/${path.split(sep).join('/')}`)), 'PNG files must match the manifest exactly')
check(!ids.has('builtin_emoji_0674') && ids.has('builtin_emoji_3833') && !ids.has('builtin_emoji_3841'), 'Preserve original IDs without renumbering removed entries')
check(Array.isArray(manifest.categories) && manifest.categories.length === categories.size && new Set(manifest.categories.map(category => category.id)).size === categories.size, 'Unexpected manifest categories')
for (const category of manifest.categories) {
  check(categories.has(category.id) && category.count === expectedCounts[category.id] && counts[category.id] === category.count, `Unexpected category count: ${category.id}`)
}
const folders = await readdir(resolve(directory, 'images'), { withFileTypes: true })
check(folders.length === categories.size && folders.every(folder => folder.isDirectory() && categories.has(folder.name)), 'Only retained category folders may ship')
check((await readdir(directory)).every(name => ['images', 'manifest.v1.json'].includes(name)), 'Development documentation must not ship in the runtime pack')
console.log(JSON.stringify({ directory, emojiCount: ids.size, pngCount: actual.length, categories: counts, missing674: true, dimensions: '160x160' }, null, 2))
