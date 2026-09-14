// One-shot real Chromium/Vue regression. No dev server, authentication, messages or user clipboard writes.
import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import electron from 'electron'
const root = fileURLToPath(new URL('./context-menu-fixture', import.meta.url))
const outDir = fileURLToPath(new URL('../.cache/context-menu-ui', import.meta.url))
await build({ configFile: false, root, base: './', plugins: [vue()], build: { outDir, emptyOutDir: true } })
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const processUnderTest = spawn(electron, [fileURLToPath(new URL('./test-context-menu-electron.mjs', import.meta.url))], { stdio: 'inherit', env, windowsHide: true })
process.exitCode = await new Promise(resolve => processUnderTest.on('exit', code => resolve(code ?? 1)))
