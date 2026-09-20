const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('emojiFixture', { manifest: () => ipcRenderer.invoke('fixture:emoji-manifest') })
