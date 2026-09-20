import { app, BrowserWindow, ipcMain, session } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
const output = fileURLToPath(new URL('../.cache/emoji-ui', import.meta.url))
const packaged = process.argv.includes('--packaged')
const devOrigin = process.env.EMOJI_FIXTURE_ORIGIN
const assets = packaged ? fileURLToPath(new URL('../release/win-unpacked/resources/app.asar/dist', import.meta.url)) : output
app.setPath('userData', `${output}/electron-profile`)
app.disableHardwareAcceleration()
// Keep the test app alive while replacing the success window with the failure window.
app.on('window-all-closed', () => undefined)
let window, requests = 0, failCatalog = false
let drafts = {}
const timeout = setTimeout(() => { console.error('Emoji UI regression exceeded 60 seconds'); window?.destroy(); app.exit(1) }, 60000)
ipcMain.handle('emoji:builtin-manifest', async () => {
  requests++
  if (failCatalog) throw new Error('Simulated missing manifest')
  return JSON.parse(await readFile(`${assets}/emoji/builtin/manifest.v1.json`, 'utf8'))
})
ipcMain.handle('fixture:emoji-manifest', async () => JSON.parse(await readFile(`${assets}/emoji/builtin/manifest.v1.json`, 'utf8')))
// Actual preload channels with isolated in-memory drafts.
ipcMain.handle('drafts:list', (_event, user) => drafts[user] || {})
ipcMain.handle('drafts:save', (_event, user, conversation, value) => { (drafts[user] ||= {})[conversation] = value; return true })
async function createWindow(chat = false) {
  const result = new BrowserWindow({ show: false, width: chat ? 1200 : 900, height: 920, webPreferences: {
    preload: fileURLToPath(new URL(chat ? './emoji-fixture/chat-preload.cjs' : '../dist-electron/preload.cjs', import.meta.url)),
    nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false, offscreen: true,
  } })
  result.webContents.on('render-process-gone', (_event, details) => console.error('Renderer process exited', details))
  result.webContents.on('console-message', details => { if (details.level >= 2) console.error('Renderer:', details.message) })
  const pageUrl = devOrigin ? new URL(chat ? 'chat.html' : 'index.html', devOrigin).href : pathToFileURL(join(output, chat ? 'chat.html' : 'index.html')).href
  console.log('Emoji fixture page:', pageUrl, 'Electron:', process.versions.electron)
  await result.loadURL(pageUrl)
  await result.webContents.executeJavaScript(`new Promise((resolve, reject) => { const start = Date.now(); const timer = setInterval(() => { if (window.${chat ? 'emojiChatRegression' : 'emojiRegression'}) { clearInterval(timer); resolve(true) } else if (Date.now() - start > 5000) { clearInterval(timer); reject(new Error('Fixture did not initialize')) } }, 20) })`)
  if (packaged) await result.webContents.executeJavaScript(`{ const base = document.createElement('base'); base.href = ${JSON.stringify(pathToFileURL(`${assets}/`).href)}; document.head.append(base) }`)
  return result
}
app.whenReady().then(async () => {
  await mkdir(output, { recursive: true })
  if (devOrigin) session.defaultSession.webRequest.onBeforeRequest({ urls: [`${devOrigin}*`] }, (details, callback) => {
    const manifest = new URL(details.url).pathname.endsWith('/emoji/builtin/manifest.v1.json')
    if (manifest) requests++
    callback({ cancel: manifest && failCatalog })
  })
  window = await createWindow()
  const results = await window.webContents.executeJavaScript('window.emojiRegression.run()')
  if (requests !== 1) throw new Error(`Expected 1 manifest read across all renders/reopens; got ${requests}`)
  results.push('one cached manifest read across renderers, editor and repeated picker mounts')
  await window.webContents.executeJavaScript('window.emojiRegression.prepareNative()')
  await window.webContents.insertText('继续')
  let state = await window.webContents.executeJavaScript('window.emojiRegression.state()')
  if (state.text !== '你[emoji:builtin_emoji_0001]继续好') throw new Error(`Native typing moved caret: ${state.text}`)
  results.push('native Chromium text insertion continues after Emoji at saved caret')
  for (let i = 0; i < 3; i++) {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' })
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' })
  }
  state = await window.webContents.executeJavaScript('window.emojiRegression.state()')
  if (state.text !== '你好' || state.images !== 0) throw new Error(`Native Backspace failed: ${JSON.stringify(state)}`)
  results.push('native Backspace deletes typed characters then one whole Emoji')
  for (const dark of [false, true]) {
    await window.webContents.executeJavaScript(`window.emojiRegression.screenshot(${dark})`)
    const loaded = await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('img')).every(image => image.complete && image.naturalWidth === 160)`)
    if (!loaded) throw new Error('Visible file:// PNG resources did not decode at 160px')
    await writeFile(`${output}/emoji-${packaged ? 'packaged-' : ''}${dark ? 'dark' : 'light'}.png`, (await window.webContents.capturePage()).toPNG())
  }
  results.push(`${devOrigin ? 'Vite dev HTTP' : packaged ? 'packaged app.asar file://' : 'built renderer file://'} visible PNGs decode at 160x160 in light/dark mode`)
  window.destroy(); failCatalog = true; drafts = {}
  window = await createWindow()
  results.push(...await window.webContents.executeJavaScript('window.emojiRegression.failure()'))
  if (requests !== 2) throw new Error('Failed manifest was retried unexpectedly')
  window.destroy()
  failCatalog = false
  window = await createWindow(true)
  results.push(...await window.webContents.executeJavaScript('window.emojiChatRegression.run()'))
  await window.webContents.executeJavaScript('window.emojiChatRegression.screenshot()')
  await writeFile(`${output}/emoji-chat${packaged ? '-packaged' : ''}.png`, (await window.webContents.capturePage()).toPNG())
  await window.webContents.executeJavaScript('window.emojiChatRegression.dispose()')
  await writeFile(`${output}/results${devOrigin ? '-dev' : packaged ? '-packaged' : ''}.json`, JSON.stringify(results, null, 2))
  console.log(`PASS: ${results.length} real Electron/Vue Emoji checks\n${results.join('\n')}`)
  clearTimeout(timeout)
  window.webContents.removeAllListeners('render-process-gone')
  window.webContents.removeAllListeners('console-message')
  window.destroy()
  // Allow outstanding Chromium teardown callbacks to drain before terminating V8.
  setTimeout(() => app.quit(), 100)
}).catch(error => { console.error(error); clearTimeout(timeout); window?.destroy(); app.exit(1) })
