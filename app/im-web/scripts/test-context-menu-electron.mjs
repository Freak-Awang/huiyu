import { app, BrowserWindow } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const output = fileURLToPath(new URL('../.cache/context-menu-ui', import.meta.url))
app.setPath('userData', `${output}/electron-profile`)
let window
const timeout = setTimeout(() => { console.error('Menu UI regression exceeded 30 seconds'); window?.destroy(); app.exit(1) }, 30000)
app.whenReady().then(async () => {
  window = new BrowserWindow({ show: false, width: 900, height: 700, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false, offscreen: true } })
  window.webContents.on('console-message', details => { if (details.message.includes('Error')) console.error(details.message) })
  await window.loadFile(`${output}/index.html`)
  await window.webContents.executeJavaScript(`new Promise((resolve, reject) => { const start = Date.now(); const timer = setInterval(() => { if (window.menuRegression) { clearInterval(timer); resolve(true) } else if (Date.now() - start > 5000) { clearInterval(timer); reject(new Error('Fixture failed to initialize')) } }, 20) })`)
  const results = await window.webContents.executeJavaScript('window.menuRegression.run()')
  await window.webContents.executeJavaScript('window.menuRegression.screenshot(false)')
  await mkdir(output, { recursive: true })
  await writeFile(`${output}/menu-light.png`, (await window.webContents.capturePage()).toPNG())
  await window.webContents.executeJavaScript('window.menuRegression.screenshot(true)')
  await writeFile(`${output}/menu-dark.png`, (await window.webContents.capturePage()).toPNG())
  window.setContentSize(320, 360)
  await window.webContents.executeJavaScript('window.menuRegression.screenshot(false)')
  const bounds = await window.webContents.executeJavaScript(`(() => { const rect = document.querySelector('[role=menu]').getBoundingClientRect(); return rect.left >= 5 && rect.top >= 5 && rect.right <= innerWidth - 5 && rect.bottom <= innerHeight - 5 })()`)
  if (!bounds) throw new Error('Small-window menu exceeded viewport')
  results.push('small Electron window bounds')
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2))
  console.log(`PASS: ${results.length} real Electron/Vue menu checks`)
  clearTimeout(timeout); window.destroy(); app.exit(0)
}).catch(error => {
  console.error(error)
  clearTimeout(timeout); window?.destroy(); app.exit(1)
})
