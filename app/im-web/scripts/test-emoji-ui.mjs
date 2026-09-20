// One-shot real Electron/Chromium checks. Isolated profile; no server, login or live messages.
import { build, createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import electron from 'electron'
const root = fileURLToPath(new URL('./emoji-fixture', import.meta.url))
const outDir = fileURLToPath(new URL('../.cache/emoji-ui', import.meta.url))
const dev = process.argv.includes('--dev')
const config = { configFile: false, root, base: './', publicDir: fileURLToPath(new URL('../public', import.meta.url)), plugins: [vue()] }
let server
if (dev) {
  server = await createServer({ ...config, server: { host: '127.0.0.1', port: 5173, strictPort: true, fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } } })
  await server.listen()
} else await build({ ...config, build: { outDir, emptyOutDir: true, rolldownOptions: { input: { index: `${root}/index.html`, chat: `${root}/chat.html` } } } })
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
if (server) env.EMOJI_FIXTURE_ORIGIN = server.resolvedUrls.local[0]
try {
  const child = spawn(electron, [fileURLToPath(new URL('./test-emoji-electron.mjs', import.meta.url)), ...process.argv.slice(2)], { stdio: 'inherit', env, windowsHide: true })
  process.exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => resolve(code ?? 1)) })
} finally { await server?.close() }
