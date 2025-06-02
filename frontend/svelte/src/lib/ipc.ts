// frontend/svelte/src/lib/ipc.ts
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
  private electronAPI: any

  constructor() {
    // Handle both electron contexts
    this.electronAPI = (window as any).electronAPI || (window as any).require?.('electron')?.ipcRenderer

    if (this.electronAPI?.on) {
      this.electronAPI.on('vault-event', (event: any, data: any) => {
        console.log('🔄 IPC Event received:', data.type, data.payload)
        this.emit(data.type, data.payload)
      })
    }
  }

  // Event system
  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(callback)
    console.log(`📡 Listener registered for: ${event}`)
  }

  off(event: string, callback: Function) {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
        console.log(`📡 Listener removed for: ${event}`)
      }
    }
  }

  removeAllListeners(event: string) {
    this.listeners.delete(event)
    console.log(`📡 All listeners removed for: ${event}`)
  }

  private emit(event: string, data: any) {
    const callbacks = this.listeners.get(event)
    console.log(`📡 Emitting "${event}" to ${callbacks?.length || 0} listeners`)
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(data)
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error)
        }
      })
    }
  }

  private async invoke(channel: string, data?: any) {
    if (this.electronAPI?.invoke) {
      return await this.electronAPI.invoke(channel, data)
    }
    throw new Error('Electron API not available')
  }

  // Vault management
  async listVaults(): Promise<Vault[]> {
    try {
      return await this.invoke('vault:list')
    } catch {
      return []
    }
  }

  async createVault(name: string, path: string): Promise<Vault> {
    return await this.invoke('vault:create', { name, path })
  }

  async openVault(path: string): Promise<boolean> {
    return await this.invoke('vault:open', { path })
  }

  async closeVault(): Promise<void> {
    return await this.invoke('vault:close')
  }

  // Profile methods
  async getProfile(): Promise<Profile | null> {
    return await this.invoke('profile:get')
  }

  async updateProfile(profile: Partial<Profile>): Promise<Profile> {
    return await this.invoke('profile:update', profile)
  }

  // Group methods
  async createGroup(name: string, parentId?: string, options?: { color?: string, icon?: string }): Promise<Group> {
    return await this.invoke('group:create', { name, parentId, ...options })
  }

  async updateGroup(id: string, updates: Partial<Group>): Promise<Group> {
    return await this.invoke('group:update', { id, updates })
  }

  async deleteGroup(id: string): Promise<void> {
    return await this.invoke('group:delete', { id })
  }

  async getGroup(id: string): Promise<Group | null> {
    return await this.invoke('group:get', { id })
  }

  async listGroups(): Promise<Group[]> {
    return await this.invoke('group:list')
  }

  // Page methods
  async createPage(title: string, content?: string, groupId?: string, options?: { tags?: string[], starred?: boolean }): Promise<Page> {
    return await this.invoke('page:create', { title, content, groupId, ...options })
  }

  async updatePage(id: string, updates: Partial<Page>): Promise<Page> {
    return await this.invoke('page:update', { id, updates })
  }

  async deletePage(id: string): Promise<void> {
    return await this.invoke('page:delete', { id })
  }

  async getPage(id: string): Promise<Page | null> {
    return await this.invoke('page:get', { id })
  }

  async listPages(options?: { groupId?: string, starred?: boolean }): Promise<Page[]> {
    return await this.invoke('page:list', options)
  }

  async searchPages(searchTerm: string): Promise<Page[]> {
    return await this.invoke('page:search', { searchTerm })
  }

  // Invite methods
  async createInvite(): Promise<string> {
    return await this.invoke('invite:create')
  }

  async deleteInvite(): Promise<void> {
    return await this.invoke('invite:delete')
  }

  async acceptInvite(invite: string, vaultPath: string): Promise<boolean> {
    return await this.invoke('invite:accept', { invite, vaultPath })
  }

  // Writer management
  async addWriter(key: string): Promise<boolean> {
    return await this.invoke('writer:add', { key })
  }

  async removeWriter(key: string): Promise<void> {
    return await this.invoke('writer:remove', { key })
  }
}

export const ipc = new IpcBridge()
