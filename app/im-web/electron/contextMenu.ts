import { clipboard, dialog, ipcMain, nativeImage } from 'electron'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { writeFile } from 'node:fs/promises'
import { basename } from 'node:path'

export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value.trim())) return null
  try {
    const url = new URL(value.trim())
    return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export function imageBuffer(value: unknown) {
  if (!(value instanceof Uint8Array) && !(value instanceof ArrayBuffer)) throw new Error('图片数据无效')
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value
  if (!bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) throw new Error('图片大小超出 20MB 限制')
  const image = nativeImage.createFromBuffer(Buffer.from(bytes))
  if (image.isEmpty()) throw new Error('无法读取图片内容')
  const size = image.getSize()
  if (size.width * size.height > 40_000_000) throw new Error('图片尺寸过大')
  return image
}

export function registerContextMenuHandlers(assertTrusted: (event: IpcMainInvokeEvent) => void, getWindow: () => BrowserWindow | null) {
  ipcMain.handle('clipboard:state', event => {
    assertTrusted(event)
    const formats = clipboard.availableFormats()
    return { text: formats.some(format => /text|unicode/i.test(format)), image: formats.some(format => /image|bitmap|png|dib/i.test(format)) }
  })
  ipcMain.handle('clipboard:write-text', (event, value: unknown) => {
    assertTrusted(event)
    if (typeof value !== 'string' || value.length > 2_000_000) throw new Error('复制的文本无效或过长')
    clipboard.writeText(value)
    return true
  })
  ipcMain.handle('clipboard:write-image', (event, value: unknown) => {
    assertTrusted(event)
    clipboard.writeImage(imageBuffer(value))
    return true
  })
  ipcMain.handle('editor:command', (event, command: unknown) => {
    assertTrusted(event)
    switch (command) {
      case 'undo': event.sender.undo(); break
      case 'redo': event.sender.redo(); break
      case 'cut': event.sender.cut(); break
      case 'copy': event.sender.copy(); break
      case 'paste': event.sender.paste(); break
      case 'selectAll': event.sender.selectAll(); break
      default: throw new Error('不支持的编辑操作')
    }
    return true
  })
  ipcMain.handle('image:save-as', async (event, value: unknown, name: unknown) => {
    assertTrusted(event)
    const image = imageBuffer(value)
    const parent = getWindow()
    if (!parent) throw new Error('应用窗口不可用')
    const safeName = basename(typeof name === 'string' ? name : '图片').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 80)
    const result = await dialog.showSaveDialog(parent, { title: '图片另存为', defaultPath: `${safeName || '图片'}.png`, filters: [{ name: 'PNG 图片', extensions: ['png'] }] })
    if (result.canceled || !result.filePath) return { canceled: true }
    // Destination comes exclusively from the OS save dialog. The renderer cannot supply a path.
    await writeFile(result.filePath, image.toPNG())
    return { canceled: false }
  })
}
