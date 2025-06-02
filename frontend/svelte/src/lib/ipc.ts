// frontend/svelte/src/lib/ipc.ts
import type { IpcRendererEvent } from 'electron'
import { ipcRenderer } from 'electron'

export interface Profile {
  userId: string
  displayName: string
  email?: string
  avatar?: Buffer
  createdAt: number
  updatedAt: number
}

export interface Group {
  id: string
  name: string
  parentId?: string
  color?: string
  icon?: string
  createdAt: number
  updatedAt: number
}

export interface Page {
  id: string
  title: string
  content?: string
  groupId?: string
  tags: string[]
  starred?: boolean
  createdAt: number
  updatedAt: number
}

export interface Vault {
  path: string
  name: string
  key?: string
  lastAccessed: number
}

class IpcBridge {
  private listeners = new Map<string, Function[]>()

  constructor() {
    // Set up IPC event forwarding
    ipcRenderer.on('vault-event', (event: IpcRendererEvent, data: any) => {
      this.emit(data.type, data.payload)
    })
  }

  // Event system
  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(callback)
  }

  off(event: string, callback: Function) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      const index = callbacks.indexOf(callback)
      if (index > -1) callbacks.splice(index, 1)
    }
  }

  private emit(event: string, data: any) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.forEach(cb => cb(data))
    }
  }

  // Vault management
  async listVaults(): Promise<Vault[]> {
    return await ipcRenderer.invoke('vault:list')
  }

  async createVault(name: string, path: string): Promise<Vault> {
    return await ipcRenderer.invoke('vault:create', { name, path })
  }

  async openVault(path: string): Promise<boolean> {
    return await ipcRenderer.invoke('vault:open', { path })
  }

  async closeVault(): Promise<void> {
    return await ipcRenderer.invoke('vault:close')
  }

  // Profile methods
  async getProfile(): Promise<Profile | null> {
    return await ipcRenderer.invoke('profile:get')
  }

  async updateProfile(profile: Partial<Profile>): Promise<Profile> {
    return await ipcRenderer.invoke('profile:update', profile)
  }

  // Group methods
  async createGroup(name: string, parentId?: string, options?: { color?: string, icon?: string }): Promise<Group> {
    return await ipcRenderer.invoke('group:create', { name, parentId, ...options })
  }

  async updateGroup(id: string, updates: Partial<Group>): Promise<Group> {
    return await ipcRenderer.invoke('group:update', { id, updates })
  }

  async deleteGroup(id: string): Promise<void> {
    return await ipcRenderer.invoke('group:delete', { id })
  }

  async getGroup(id: string): Promise<Group | null> {
    return await ipcRenderer.invoke('group:get', { id })
  }

  async listGroups(): Promise<Group[]> {
    return await ipcRenderer.invoke('group:list')
  }

  // Page methods
  async createPage(title: string, content?: string, groupId?: string, options?: { tags?: string[], starred?: boolean }): Promise<Page> {
    return await ipcRenderer.invoke('page:create', { title, content, groupId, ...options })
  }

  async updatePage(id: string, updates: Partial<Page>): Promise<Page> {
    return await ipcRenderer.invoke('page:update', { id, updates })
  }

  async deletePage(id: string): Promise<void> {
    return await ipcRenderer.invoke('page:delete', { id })
  }

  async getPage(id: string): Promise<Page | null> {
    return await ipcRenderer.invoke('page:get', { id })
  }

  async listPages(options?: { groupId?: string, starred?: boolean }): Promise<Page[]> {
    return await ipcRenderer.invoke('page:list', options)
  }

  async searchPages(searchTerm: string): Promise<Page[]> {
    return await ipcRenderer.invoke('page:search', { searchTerm })
  }

  // Invite methods
  async createInvite(): Promise<string> {
    return await ipcRenderer.invoke('invite:create')
  }

  async deleteInvite(): Promise<void> {
    return await ipcRenderer.invoke('invite:delete')
  }

  async acceptInvite(invite: string, vaultPath: string): Promise<boolean> {
    return await ipcRenderer.invoke('invite:accept', { invite, vaultPath })
  }

  // Writer management
  async addWriter(key: string): Promise<boolean> {
    return await ipcRenderer.invoke('writer:add', { key })
  }

  async removeWriter(key: string): Promise<void> {
    return await ipcRenderer.invoke('writer:remove', { key })
  }
}

export const ipc = new IpcBridge()
