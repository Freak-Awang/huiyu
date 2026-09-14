import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  clipboard: { writeText: vi.fn(), writeImage: vi.fn(), availableFormats: () => ['text/plain'] },
  image: { isEmpty: () => false, getSize: () => ({ width: 10, height: 10 }), toPNG: () => Buffer.from('png') },
  dialog: vi.fn(), write: vi.fn(),
}))
vi.mock('electron', () => ({ clipboard: state.clipboard, nativeImage: { createFromBuffer: () => state.image },
  ipcMain: { handle: (name: string, handler: (...args: unknown[]) => unknown) => state.handlers.set(name, handler) },
  dialog: { showSaveDialog: state.dialog },
}))
vi.mock('node:fs/promises', () => ({ writeFile: state.write }))
import { imageBuffer, registerContextMenuHandlers, safeExternalUrl } from './contextMenu'
beforeEach(() => { vi.clearAllMocks(); state.handlers.clear() })
describe('native context menu capability boundary', () => {
  it('uses writeImage with decoded bytes instead of copying a URL', async () => {
    registerContextMenuHandlers(() => {}, () => null)
    await state.handlers.get('clipboard:write-image')!({}, new Uint8Array([137, 80]))
    expect(state.clipboard.writeImage).toHaveBeenCalledWith(state.image)
    expect(state.clipboard.writeText).not.toHaveBeenCalled()
    expect(() => imageBuffer('https://example.com/image.png')).toThrow('数据无效')
    expect(() => imageBuffer(new ArrayBuffer(21 * 1024 * 1024))).toThrow('限制')
  })
  it('validates the sender before touching clipboard, editor or save dialog', () => {
    registerContextMenuHandlers(() => { throw new Error('untrusted frame') }, () => null)
    for (const name of ['clipboard:state', 'clipboard:write-text', 'clipboard:write-image', 'editor:command']) {
      expect(() => state.handlers.get(name)!({}, 'hello')).toThrow('untrusted frame')
    }
    expect(state.clipboard.writeText).not.toHaveBeenCalled()
    expect(state.clipboard.writeImage).not.toHaveBeenCalled()
  })
  it('allows only six editor commands, without exposing webContents', () => {
    registerContextMenuHandlers(() => {}, () => null)
    const paste = vi.fn()
    state.handlers.get('editor:command')!({ sender: { paste } } as unknown as IpcMainInvokeEvent, 'paste')
    expect(paste).toHaveBeenCalledOnce()
    expect(() => state.handlers.get('editor:command')!({}, 'executeJavaScript')).toThrow('不支持')
  })
  it('writes only to an OS-selected path and respects cancellation', async () => {
    registerContextMenuHandlers(() => {}, () => ({}) as never)
    state.dialog.mockResolvedValueOnce({ canceled: true })
    await state.handlers.get('image:save-as')!({}, new Uint8Array([1]), '../../bad')
    expect(state.write).not.toHaveBeenCalled()
    state.dialog.mockResolvedValueOnce({ canceled: false, filePath: 'C:\\selected\\image.png' })
    await state.handlers.get('image:save-as')!({}, new Uint8Array([1]), '../../bad')
    expect(state.write).toHaveBeenCalledWith('C:\\selected\\image.png', Buffer.from('png'))
  })
  it.each(['javascript:alert(1)', 'file:///C:/secret', 'data:image/png,1', 'https://', 'https://x\n.com', 'https://u:p@example.com'])('blocks external URL %s', value => expect(safeExternalUrl(value)).toBeNull())
  it('allows valid http and https links', () => {
    expect(safeExternalUrl('http://example.com')).toBe('http://example.com/')
    expect(safeExternalUrl('https://example.com/a')).toBe('https://example.com/a')
  })
})
