// Bounded, offline Electron integration run. No server or additional dependencies.
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { spawn } from 'node:child_process'

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const web = path.join(workspace, 'app', 'im-web')
const require = createRequire(path.join(web, 'package.json'))
const { rolldown } = await import(pathToFileURL(require.resolve('rolldown')).href)
const cache = path.join(web, '.cache', 'p2p-e2e')
await fs.mkdir(cache, { recursive: true })
const runRoot = await fs.mkdtemp(path.join(cache, 'run-'))
await fs.writeFile(path.join(runRoot, '.p2p-e2e-generated'), 'Synthetic integration-test data only.\n')

async function bundle(input, output, platform, format) {
  const build = await rolldown({
    input,
    platform,
    cwd: web,
    resolve: { modules: [path.join(web, 'node_modules'), 'node_modules'] },
    external: platform === 'node' ? ['electron'] : [],
    transform: { define: { 'process.env.NODE_ENV': JSON.stringify('production'),
      __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' } },
    onLog(level, log, handler) {
      if (log.code === 'EVAL' || log.code === 'IMPORT_META_EMPTY' || log.code === 'EMPTY_IMPORT_META') return
      handler(level, log)
    },
  })
  try { await build.write({ file: path.join(runRoot, output), format, sourcemap: true }) }
  finally { await build.close() }
}

try {
  await bundle(path.join(workspace, 'scripts', 'p2p-e2e.renderer.ts'), 'renderer.js', 'browser', 'iife')
  await bundle(path.join(web, 'electron', 'preload.cts'), 'production-preload.cjs', 'node', 'cjs')
  const preloadAddon = `;(()=>{const {contextBridge,ipcRenderer}=require('electron');\n`
    + `contextBridge.exposeInMainWorld('p2pE2EBridge',{request:(cmd,data)=>ipcRenderer.invoke('p2p-e2e:request',cmd,data),send:(cmd,data)=>ipcRenderer.send('p2p-e2e:send',cmd,data),onSignal:(fn)=>{const h=(_e,m)=>fn(m);ipcRenderer.on('p2p-e2e:signal',h);return()=>ipcRenderer.removeListener('p2p-e2e:signal',h)}});})();\n`
  await fs.appendFile(path.join(runRoot, 'production-preload.cjs'), '\n' + preloadAddon)
  await fs.writeFile(path.join(runRoot, 'index.html'), '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; connect-src \'self\'; worker-src \'self\' blob:"><title>P2P integration</title><script src="renderer.js"></script>')
  await bundle(path.join(workspace, 'scripts', 'p2p-e2e.main.ts'), 'main.cjs', 'node', 'cjs')
  if (process.argv.includes('--build-only')) {
    console.log(`P2P E2E bundles ready: ${runRoot}`)
  } else {
    const environment = { ...process.env }
    delete environment.ELECTRON_RUN_AS_NODE
    const child = spawn(require('electron'), [path.join(runRoot, 'main.cjs'), `--p2p-e2e-root=${runRoot}`], {
      cwd: web, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', (chunk) => process.stdout.write(chunk))
    child.stderr.on('data', (chunk) => process.stderr.write(chunk))
    const timeout = setTimeout(() => {
      if (process.platform === 'win32' && child.pid) {
        // This PID is the Electron process created above, never a discovered/user process.
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      } else child.kill()
    }, 240_000)
    const exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject); child.once('exit', (code) => resolve(code ?? 1))
    }).finally(() => clearTimeout(timeout))
    const reportPath = path.join(runRoot, 'report.json')
    try {
      await fs.copyFile(reportPath, path.join(cache, 'latest.json'))
      console.log(`P2P E2E report: ${path.join(cache, 'latest.json')}`)
    } catch { /* The main process may have failed before initialization. */ }
    if (exitCode !== 0) process.exitCode = 1
  }
} finally {
  if (!process.argv.includes('--keep')) {
    const resolved = path.resolve(runRoot)
    if (!resolved.startsWith(path.resolve(cache) + path.sep)
      || !(await fs.stat(path.join(resolved, '.p2p-e2e-generated')).catch(() => null))?.isFile()) {
      throw new Error(`Refusing to clean an unverified E2E directory: ${resolved}`)
    }
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  }
}
