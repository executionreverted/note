// frontend/electron/index.ts - Updated with version control
import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { IpcMainEvent } from 'electron/main'
import * as path from 'path'
import * as fs from 'fs'
import Autonote from '../../backend/src/main.js'
import Corestore from 'corestore'

// Global state
let mainWindow: BrowserWindow
let currentAutonote: any = null
let vaultsConfig: any = {}
const configPath = path.join(app.getPath('userData'), 'vaults.json')

function loadVaultsConfig() {
  try {
    if (fs.existsSync(configPath)) {
      vaultsConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    }
  } catch (error) {
    console.error('Failed to load vaults config:', error)
    vaultsConfig = { vaults: [] }
  }
}

function saveVaultsConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(vaultsConfig, null, 2))
  } catch (error) {
    console.error('Failed to save vaults config:', error)
  }
}

function setupRealTimeSync(autonote: any) {
  console.log('Setting up real-time sync listeners')

  autonote.on('update', () => {
    console.log('Autonote update event - peer changes detected')
    sendToRenderer('vault:realtime-update', {})
  })

  autonote.on('peer-connected', (peerInfo: any) => {
    console.log('Peer connected:', peerInfo)
    sendToRenderer('sync:peer-connected', peerInfo)
  })

  autonote.on('peer-disconnected', (peerInfo: any) => {
    console.log('Peer disconnected:', peerInfo)
    sendToRenderer('sync:peer-disconnected', peerInfo)
  })
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    titleBarStyle: 'hiddenInset',
    show: false
  })

  mainWindow.loadFile('index.html')

  if (process.env.ELECTRON_MODE === 'dev') {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  return mainWindow
}

// App lifecycle
app.whenReady().then(() => {
  loadVaultsConfig()
  mainWindow = createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  if (currentAutonote) {
    await currentAutonote.close()
  }
})

function sendToRenderer(event: string, data: any) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('vault-event', { type: event, payload: data })
  }
}

// IPC Handlers

// Dialog handlers
ipcMain.handle('dialog:selectDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Vault Location'
  })

  return result.canceled ? null : result.filePaths[0]
})

// Vault management
ipcMain.handle('vault:list', async () => {
  if (!vaultsConfig.vaults) vaultsConfig.vaults = []
  return vaultsConfig.vaults
})

ipcMain.handle('vault:create', async (event, { name, path }) => {
  try {
    if (!fs.existsSync(path)) {
      fs.mkdirSync(path, { recursive: true })
    }

    const vault = {
      name,
      path,
      lastAccessed: Date.now()
    }

    if (!vaultsConfig.vaults) vaultsConfig.vaults = []
    vaultsConfig.vaults.push(vault)
    saveVaultsConfig()

    return vault
  } catch (error) {
    console.error('Failed to create vault:', error)
    throw error
  }
})

ipcMain.handle('vault:open', async (event, { path }) => {
  try {
    if (currentAutonote) {
      await currentAutonote.close()
    }

    const store = new Corestore(path)
    currentAutonote = new Autonote(store)
    await currentAutonote.ready()

    if (vaultsConfig.vaults) {
      const vault = vaultsConfig.vaults.find(v => v.path === path)
      if (vault) {
        vault.lastAccessed = Date.now()
        saveVaultsConfig()
      }
    }

    currentAutonote.on('update', () => {
      sendToRenderer('vault:update', {})
    })

    setupRealTimeSync(currentAutonote)
    return true
  } catch (error) {
    console.error('Failed to open vault:', error)
    throw error
  }
})

ipcMain.handle('vault:close', async () => {
  if (currentAutonote) {
    await currentAutonote.close()
    currentAutonote = null
  }
})

// Profile handlers
ipcMain.handle('profile:get', async () => {
  if (!currentAutonote) throw new Error('No vault open')
  return await currentAutonote.getProfile()
})

ipcMain.handle('profile:update', async (event, profile) => {
  if (!currentAutonote) throw new Error('No vault open')
  const updated = await currentAutonote.updateProfile(profile)
  sendToRenderer('profile:updated', updated)
  return updated
})

// Group handlers
ipcMain.handle('group:create', async (event, { name, parentId, color, icon }) => {
  if (!currentAutonote) throw new Error('No vault open')
  const group = await currentAutonote.createGroup(name, parentId, { color, icon })
  sendToRenderer('group:created', group)
  return group
})

ipcMain.handle('group:update', async (event, { id, updates }) => {
  if (!currentAutonote) throw new Error('No vault open')
  const updated = await currentAutonote.updateGroup(id, updates)
  sendToRenderer('group:updated', updated)
  return updated
})

ipcMain.handle('group:delete', async (event, { id }) => {
  if (!currentAutonote) throw new Error('No vault open')
  await currentAutonote.deleteGroup(id)
  sendToRenderer('group:deleted', { id })
})

ipcMain.handle('group:get', async (event, { id }) => {
  if (!currentAutonote) throw new Error('No vault open')
  return await currentAutonote.getGroup(id)
})

ipcMain.handle('group:list', async () => {
  if (!currentAutonote) throw new Error('No vault open')
  return await currentAutonote.listGroups()
})

// Version-aware page handlers
ipcMain.handle('page:create', async (event, { title, content, groupId, tags, starred }) => {
  if (!currentAutonote) throw new Error('No vault open')
  const page = await currentAutonote.createPage(title, content, groupId, { tags, starred })
  sendToRenderer('page:created', page)
  return page
})

ipcMain.handle('page:update', async (event, { id, updates, baseVersion }) => {
  if (!currentAutonote) throw new Error('No vault open')
  try {
    const updated = await currentAutonote.updatePage(id, updates, baseVersion)
    sendToRenderer('page:updated', updated)
    return updated
  } catch (error) {
    // Handle version conflicts or other update errors
    console.error('Failed to update page:', error)
    throw error
  }
})

ipcMain.handle('page:delete', async (event, { id }) => {
  if (!currentAutonote) throw new Error('No vault open')
  await currentAutonote.deletePage(id)
  sendToRenderer('page:deleted', { id })
})

ipcMain.handle('page:get', async (event, { id }) => {
  if (!currentAutonote) throw new Error('No vault open')
  return await currentAutonote.getPage(id)
})

// Get page with version info (for conflict detection)
ipcMain.handle('page:getWithVersion', async (event, { id }) => {
  if (!currentAutonote) throw new Error('No vault open')
  return await currentAutonote.getPageWithVersion(id)
})

ipcMain.handle('page:list', async (event, options = {}) => {
  if (!currentAutonote) throw new Error('No vault open')
  return await currentAutonote.listPages(options)
})

ipcMain.handle('page:search', async (event, { searchTerm }) => {
  if (!currentAutonote) throw new Error('No vault open')
  return await currentAutonote.searchPages(searchTerm)
})

// Invite handlers
ipcMain.handle('invite:create', async () => {
  if (!currentAutonote) throw new Error('No vault open')
  return await currentAutonote.createInvite()
})

ipcMain.handle('invite:delete', async () => {
  if (!currentAutonote) throw new Error('No vault open')
  await currentAutonote.deleteInvite()
})

ipcMain.handle('invite:accept', async (event, { invite, vaultPath }) => {
  try {
    if (currentAutonote) {
      await currentAutonote.close()
    }

    const store = new Corestore(vaultPath)
    const pair = Autonote.pair(store, invite)
    currentAutonote = await pair.finished()
    await currentAutonote.ready()

    currentAutonote.on('update', () => {
      sendToRenderer('vault:update', {})
    })

    setupRealTimeSync(currentAutonote)
    return true
  } catch (error) {
    console.error('Failed to accept invite:', error)
    throw error
  }
})

// Writer management handlers
ipcMain.handle('writer:add', async (event, { key }) => {
  if (!currentAutonote) throw new Error('No vault open')
  return await currentAutonote.addWriter(key)
})

ipcMain.handle('writer:remove', async (event, { key }) => {
  if (!currentAutonote) throw new Error('No vault open')
  await currentAutonote.removeWriter(key)
})

// Version control helper
ipcMain.handle('page:checkVersion', async (event, { id, lastKnownVersion }) => {
  if (!currentAutonote) throw new Error('No vault open')
  try {
    const currentPage = await currentAutonote.getPageWithVersion(id)
    if (!currentPage) return { exists: false }

    return {
      exists: true,
      hasConflict: currentPage.updatedAt > lastKnownVersion,
      currentVersion: currentPage.updatedAt,
      page: currentPage
    }
  } catch (error) {
    console.error('Failed to check page version:', error)
    return { exists: false, error: error.message }
  }
})

// Legacy test handler (can be removed)
ipcMain.on('asynchronous-message', (event: IpcMainEvent, arg: string) => {
  console.log(arg)
  event.reply('asynchronous-reply', 'pong')
})

// HMR in dev mode
if (process.env.ELECTRON_MODE === 'dev') {
  console.log('electron-reloader active')
  try {
    require('electron-reloader')(module)
  } catch (error) {
    console.error(error)
  }
}
