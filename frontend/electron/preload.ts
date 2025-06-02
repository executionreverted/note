import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, data?: any) => ipcRenderer.invoke(channel, data),
  on: (channel: string, callback: Function) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args))
  },
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel)
})

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, data?: any) => Promise<any>
      on: (channel: string, callback: Function) => void
      removeAllListeners: (channel: string) => void
    }
  }
}
