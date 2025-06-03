// frontend/svelte/src/lib/stores.ts - Fixed version with proper block event handling
import { writable, derived } from 'svelte/store'
import type { Profile, Group, Page, Vault } from './ipc'
import { ipc } from './ipc'
import type { Block, BlockOperation } from './types'

// App state
export const isVaultOpen = writable<boolean>(false)
export const currentVault = writable<Vault | null>(null)
export const isLoading = writable<boolean>(false)

// User profile
export const profile = writable<Profile | null>(null)

// Groups (folders)
export const groups = writable<Group[]>([])

// Pages with version tracking
export const pages = writable<Page[]>([])
export const currentPage = writable<Page | null>(null)
export const pageVersions = writable<Map<string, number>>(new Map())

// Blocks store for real-time updates
export const blocks = writable<Map<string, Block[]>>(new Map()) // pageId -> blocks[]

// UI state
export const selectedGroupId = writable<string | null>(null)
export const searchTerm = writable<string>('')
export const showStarredOnly = writable<boolean>(false)

// Real-time sync state
export const isOnline = writable<boolean>(true)
export const syncStatus = writable<'synced' | 'syncing' | 'offline' | 'error'>('synced')
export const lastSyncTime = writable<number>(Date.now())

// Toast notifications
export const toasts = writable<Array<{ id: string, message: string, type: 'info' | 'success' | 'warning' | 'error' }>>([])

let toastId = 0
let currentPageId: string | null = null

export function showToast(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  const id = `toast-${++toastId}`
  toasts.update(items => [...items, { id, message, type }])

  setTimeout(() => {
    toasts.update(items => items.filter(item => item.id !== id))
  }, 4000)
}

// Track current page ID
currentPage.subscribe(page => {
  currentPageId = page?.id || null
})

// Derived stores
export const filteredPages = derived(
  [pages, selectedGroupId, searchTerm, showStarredOnly],
  ([$pages, $selectedGroupId, $searchTerm, $showStarredOnly]) => {
    let filtered = $pages

    if ($selectedGroupId) {
      filtered = filtered.filter(page => page.groupId === $selectedGroupId)
    }

    if ($showStarredOnly) {
      filtered = filtered.filter(page => page.starred)
    }

    if ($searchTerm.trim()) {
      const term = $searchTerm.toLowerCase()
      filtered = filtered.filter(page =>
        page.title.toLowerCase().includes(term) ||
        page.content?.toLowerCase().includes(term) ||
        page.tags.some(tag => tag.toLowerCase().includes(term))
      )
    }

    return filtered.sort((a, b) => b.updatedAt - a.updatedAt)
  }
)

export const groupsTree = derived(groups, ($groups) => {
  const groupMap = new Map<string, Group & { children: Group[] }>()
  const rootGroups: (Group & { children: Group[] })[] = []

  $groups.forEach(group => {
    groupMap.set(group.id, { ...group, children: [] })
  })

  $groups.forEach(group => {
    const groupWithChildren = groupMap.get(group.id)!
    if (group.parentId && groupMap.has(group.parentId)) {
      groupMap.get(group.parentId)!.children.push(groupWithChildren)
    } else {
      rootGroups.push(groupWithChildren)
    }
  })

  return rootGroups.sort((a, b) => a.name.localeCompare(b.name))
})

// Store actions
export const storeActions = {
  // Vault actions
  async openVault(vault: Vault) {
    isLoading.set(true)
    try {
      await ipc.openVault(vault.path)
      currentVault.set(vault)
      isVaultOpen.set(true)
      await this.loadVaultData()
      this.setupRealTimeSync()
    } finally {
      isLoading.set(false)
    }
  },

  async closeVault() {
    await ipc.closeVault()
    currentVault.set(null)
    isVaultOpen.set(false)
    profile.set(null)
    groups.set([])
    pages.set([])
    currentPage.set(null)
    pageVersions.set(new Map())
    blocks.set(new Map())
    syncStatus.set('offline')
  },

  setupRealTimeSync() {
    console.log('Setting up real-time sync listeners')

    ipc.on('vault:realtime-update', this.handleRealTimeUpdate)
    ipc.on('vault:update', this.handleVaultUpdate)
  },

  handleRealTimeUpdate: async () => {
    console.log('Real-time update received from peer')
    syncStatus.set('syncing')

    try {
      await storeActions.loadVaultData()
      lastSyncTime.set(Date.now())
      syncStatus.set('synced')
      showToast('Changes synced from peer', 'info')
    } catch (error) {
      console.error('Failed to sync updates:', error)
      syncStatus.set('error')
      showToast('Sync error', 'error')
    }
  },

  handleVaultUpdate: async () => {
    console.log('Vault update event received')
    await storeActions.loadVaultData()
  },

  async loadVaultData() {
    try {
      const [profileData, groupsData, pagesData] = await Promise.all([
        ipc.getProfile(),
        ipc.listGroups(),
        ipc.listPages()
      ])

      console.log('Loading vault data:', {
        profile: profileData?.displayName,
        groups: groupsData.length,
        pages: pagesData.length
      })

      profile.set(profileData)
      groups.set(groupsData)
      pages.set(pagesData)

      // Update version tracking
      const versions = new Map<string, number>()
      pagesData.forEach(page => {
        versions.set(page.id, page.updatedAt)
      })
      pageVersions.set(versions)

      // Update current page if needed
      if (currentPageId) {
        const updatedCurrentPage = pagesData.find(p => p.id === currentPageId)
        if (updatedCurrentPage) {
          currentPage.set({ ...updatedCurrentPage })
        }
      }
    } catch (error) {
      console.error('Failed to load vault data:', error)
      throw error
    }
  },

  // Version-aware page loading
  async loadPage(id: string): Promise<Page | null> {
    try {
      const page = await ipc.getPage(id)
      if (page) {
        pageVersions.update(versions => {
          const newVersions = new Map(versions)
          newVersions.set(id, page.updatedAt)
          return newVersions
        })

        if (currentPageId === id) {
          currentPage.set(page)
        }
      }
      return page
    } catch (error) {
      console.error('Failed to load page:', error)
      return null
    }
  },

  // Profile actions
  async updateProfile(updates: Partial<Profile>) {
    syncStatus.set('syncing')
    const updated = await ipc.updateProfile(updates)
    profile.set(updated)
    syncStatus.set('synced')
    lastSyncTime.set(Date.now())
  },

  // Group actions
  async createGroup(name: string, parentId?: string, options?: { color?: string, icon?: string }) {
    syncStatus.set('syncing')
    const group = await ipc.createGroup(name, parentId, options)
    groups.update(items => [...items, group])
    syncStatus.set('synced')
    lastSyncTime.set(Date.now())
    return group
  },

  async updateGroup(id: string, updates: Partial<Group>) {
    syncStatus.set('syncing')
    const updated = await ipc.updateGroup(id, updates)
    groups.update(items => items.map(item => item.id === id ? updated : item))
    syncStatus.set('synced')
    lastSyncTime.set(Date.now())
    return updated
  },

  async deleteGroup(id: string) {
    syncStatus.set('syncing')
    await ipc.deleteGroup(id)
    groups.update(items => items.filter(item => item.id !== id))
    pages.update(items => items.filter(item => item.groupId !== id))
    syncStatus.set('synced')
    lastSyncTime.set(Date.now())
  },

  // Page actions
  async createPage(title: string, content?: string, groupId?: string, options?: { tags?: string[], starred?: boolean }) {
    syncStatus.set('syncing')
    const page = await ipc.createPage(title, content, groupId, options)
    pages.update(items => [page, ...items])

    pageVersions.update(versions => {
      const newVersions = new Map(versions)
      newVersions.set(page.id, page.updatedAt)
      return newVersions
    })

    syncStatus.set('synced')
    lastSyncTime.set(Date.now())
    return page
  },

  async updatePage(id: string, updates: Partial<Page>, baseVersion?: number) {
    syncStatus.set('syncing')
    const updated = await ipc.updatePage(id, updates)

    pages.update(items => items.map(item => item.id === id ? updated : item))

    pageVersions.update(versions => {
      const newVersions = new Map(versions)
      newVersions.set(id, updated.updatedAt)
      return newVersions
    })

    if (currentPageId === id) {
      currentPage.set(updated)
    }

    syncStatus.set('synced')
    lastSyncTime.set(Date.now())
    return updated
  },

  async deletePage(id: string) {
    syncStatus.set('syncing')
    await ipc.deletePage(id)
    pages.update(items => items.filter(item => item.id !== id))

    pageVersions.update(versions => {
      const newVersions = new Map(versions)
      newVersions.delete(id)
      return newVersions
    })

    // Remove blocks for this page
    blocks.update(pageBlocks => {
      const newBlocks = new Map(pageBlocks)
      newBlocks.delete(id)
      return newBlocks
    })

    if (currentPageId === id) {
      currentPage.set(null)
    }

    syncStatus.set('synced')
    lastSyncTime.set(Date.now())
  },

  // Search actions
  async searchPages(term: string) {
    searchTerm.set(term)
    if (term.trim()) {
      const results = await ipc.searchPages(term)
      return results
    }
    return []
  },

  async getBlocksByPage(pageId: string): Promise<Block[]> {
    try {
      const pageBlocks = await ipc.getBlocksByPage(pageId);

      // Update blocks store
      blocks.update(allBlocks => {
        const newBlocks = new Map(allBlocks)
        newBlocks.set(pageId, pageBlocks)
        return newBlocks
      })

      return pageBlocks;
    } catch (error) {
      console.error('Failed to get blocks:', error);
      return [];
    }
  },

  async getBlock(id: string): Promise<Block | null> {
    return await ipc.getBlock(id);
  },

  async createBlock(pageId: string, type: string, content: string, options: any = {}): Promise<Block> {
    syncStatus.set('syncing');
    const block = await ipc.createBlock(pageId, type, content, options);

    // Update blocks store
    blocks.update(allBlocks => {
      const newBlocks = new Map(allBlocks)
      const pageBlocks = newBlocks.get(pageId) || []
      newBlocks.set(pageId, [...pageBlocks, block].sort((a, b) => a.position - b.position))
      return newBlocks
    })

    syncStatus.set('synced');
    lastSyncTime.set(Date.now());
    return block;
  },

  async updateBlock(id: string, updates: any): Promise<Block> {
    syncStatus.set('syncing');
    const updated = await ipc.updateBlock(id, updates);

    // Update blocks store
    blocks.update(allBlocks => {
      const newBlocks = new Map(allBlocks)
      for (const [pageId, pageBlocks] of newBlocks.entries()) {
        const index = pageBlocks.findIndex(b => b.id === id)
        if (index >= 0) {
          const updatedBlocks = [...pageBlocks]
          updatedBlocks[index] = updated
          newBlocks.set(pageId, updatedBlocks)
          break
        }
      }
      return newBlocks
    })

    syncStatus.set('synced');
    lastSyncTime.set(Date.now());
    return updated;
  },

  async deleteBlock(id: string): Promise<void> {
    syncStatus.set('syncing');
    await ipc.deleteBlock(id);

    // Update blocks store
    blocks.update(allBlocks => {
      const newBlocks = new Map(allBlocks)
      for (const [pageId, pageBlocks] of newBlocks.entries()) {
        const filtered = pageBlocks.filter(b => b.id !== id)
        if (filtered.length !== pageBlocks.length) {
          newBlocks.set(pageId, filtered)
          break
        }
      }
      return newBlocks
    })

    syncStatus.set('synced');
    lastSyncTime.set(Date.now());
  },

  async moveBlock(id: string, position: number, parentId?: string): Promise<Block> {
    syncStatus.set('syncing');
    const updated = await ipc.moveBlock(id, position, parentId);

    // Update blocks store
    blocks.update(allBlocks => {
      const newBlocks = new Map(allBlocks)
      for (const [pageId, pageBlocks] of newBlocks.entries()) {
        const index = pageBlocks.findIndex(b => b.id === id)
        if (index >= 0) {
          const updatedBlocks = [...pageBlocks]
          updatedBlocks[index] = updated
          newBlocks.set(pageId, updatedBlocks.sort((a, b) => a.position - b.position))
          break
        }
      }
      return newBlocks
    })

    syncStatus.set('synced');
    lastSyncTime.set(Date.now());
    return updated;
  },

  async applyBlockOperation(blockId: string, operation: BlockOperation): Promise<{ operation: any, block: Block }> {
    syncStatus.set('syncing');
    const result = await ipc.applyBlockOperation(blockId, operation);

    // Update blocks store with the updated block
    blocks.update(allBlocks => {
      const newBlocks = new Map(allBlocks)
      for (const [pageId, pageBlocks] of newBlocks.entries()) {
        const index = pageBlocks.findIndex(b => b.id === blockId)
        if (index >= 0) {
          const updatedBlocks = [...pageBlocks]
          updatedBlocks[index] = result.block
          newBlocks.set(pageId, updatedBlocks)
          break
        }
      }
      return newBlocks
    })

    syncStatus.set('synced');
    lastSyncTime.set(Date.now());
    return result;
  },

  async migratePageToBlocks(pageId: string): Promise<Block[]> {
    syncStatus.set('syncing');
    const pageBlocks = await ipc.migratePageToBlocks(pageId);

    // Update blocks store
    blocks.update(allBlocks => {
      const newBlocks = new Map(allBlocks)
      newBlocks.set(pageId, pageBlocks)
      return newBlocks
    })

    syncStatus.set('synced');
    lastSyncTime.set(Date.now());
    return pageBlocks;
  }
}

// Real-time event listeners
ipc.on('profile:updated', (data: Profile) => {
  console.log('Profile updated by peer:', data.displayName)
  profile.set(data)
  showToast('Profile updated by peer', 'info')
})

ipc.on('group:created', (data: Group) => {
  console.log('Group created by peer:', data.name)
  groups.update(items => {
    const exists = items.some(item => item.id === data.id)
    if (!exists) {
      return [...items, data]
    }
    return items
  })
  showToast(`Group "${data.name}" created by peer`, 'success')
})

ipc.on('group:updated', (data: Group) => {
  console.log('Group updated by peer:', data.name)
  groups.update(items => items.map(item => item.id === data.id ? data : item))
  showToast(`Group "${data.name}" updated by peer`, 'info')
})

ipc.on('group:deleted', (data: { id: string }) => {
  console.log('Group deleted by peer:', data.id)
  groups.update(items => items.filter(item => item.id !== data.id))
  pages.update(items => items.filter(item => item.groupId !== data.id))
  showToast('Group deleted by peer', 'warning')
})

ipc.on('page:created', (data: Page) => {
  console.log('Page created by peer:', data.title)
  pages.update(items => {
    const exists = items.some(item => item.id === data.id)
    if (!exists) {
      return [data, ...items]
    }
    return items
  })

  pageVersions.update(versions => {
    const newVersions = new Map(versions)
    newVersions.set(data.id, data.updatedAt)
    return newVersions
  })

  showToast(`Page "${data.title}" created by peer`, 'success')
})

ipc.on('page:updated', (data: Page) => {
  console.log('Page updated by peer:', data.title)

  pages.update(items => items.map(item => item.id === data.id ? data : item))

  pageVersions.update(versions => {
    const newVersions = new Map(versions)
    newVersions.set(data.id, data.updatedAt)
    return newVersions
  })

  if (currentPageId === data.id) {
    currentPage.update(current => {
      if (current && current.id === data.id) {
        return { ...data }
      }
      return current
    })
  }

  showToast(`Page "${data.title}" updated by peer`, 'info')
})

ipc.on('page:deleted', (data: { id: string }) => {
  console.log('Page deleted by peer:', data.id)
  pages.update(items => items.filter(item => item.id !== data.id))

  pageVersions.update(versions => {
    const newVersions = new Map(versions)
    newVersions.delete(data.id)
    return newVersions
  })

  blocks.update(allBlocks => {
    const newBlocks = new Map(allBlocks)
    newBlocks.delete(data.id)
    return newBlocks
  })

  if (currentPageId === data.id) {
    currentPage.set(null)
  }

  showToast('Page deleted by peer', 'warning')
})

// BLOCK EVENT LISTENERS - This is the key addition!
ipc.on('block:created', (data: Block) => {
  console.log('Block created by peer:', data.id)

  blocks.update(allBlocks => {
    const newBlocks = new Map(allBlocks)
    const pageBlocks = newBlocks.get(data.pageId) || []
    const exists = pageBlocks.some(b => b.id === data.id)

    if (!exists) {
      newBlocks.set(data.pageId, [...pageBlocks, data].sort((a, b) => a.position - b.position))
    }

    return newBlocks
  })

  // Dispatch custom event for BlockEditor to listen to
  window.dispatchEvent(new CustomEvent('block-updated', { detail: data }))
  showToast('Block created by peer', 'success')
})

ipc.on('block:updated', (data: Block) => {
  console.log('Block updated by peer:', data.id)

  blocks.update(allBlocks => {
    const newBlocks = new Map(allBlocks)
    const pageBlocks = newBlocks.get(data.pageId) || []
    const index = pageBlocks.findIndex(b => b.id === data.id)

    if (index >= 0) {
      const updatedBlocks = [...pageBlocks]
      updatedBlocks[index] = data
      newBlocks.set(data.pageId, updatedBlocks)
    } else {
      // Block doesn't exist, add it
      newBlocks.set(data.pageId, [...pageBlocks, data].sort((a, b) => a.position - b.position))
    }

    return newBlocks
  })

  // Dispatch custom event for BlockEditor to listen to
  window.dispatchEvent(new CustomEvent('block-updated', { detail: data }))
  showToast('Block updated by peer', 'info')
})

ipc.on('block:deleted', (data: { id: string }) => {
  console.log('Block deleted by peer:', data.id)

  blocks.update(allBlocks => {
    const newBlocks = new Map(allBlocks)
    for (const [pageId, pageBlocks] of newBlocks.entries()) {
      const filtered = pageBlocks.filter(b => b.id !== data.id)
      if (filtered.length !== pageBlocks.length) {
        newBlocks.set(pageId, filtered)
        break
      }
    }
    return newBlocks
  })

  // Dispatch custom event
  window.dispatchEvent(new CustomEvent('block-deleted', { detail: data }))
  showToast('Block deleted by peer', 'warning')
})

ipc.on('block:operation-applied', (data: { operation: any, block: Block }) => {
  console.log('Block operation applied by peer:', data.block.id)

  blocks.update(allBlocks => {
    const newBlocks = new Map(allBlocks)
    const pageBlocks = newBlocks.get(data.block.pageId) || []
    const index = pageBlocks.findIndex(b => b.id === data.block.id)

    if (index >= 0) {
      const updatedBlocks = [...pageBlocks]
      updatedBlocks[index] = data.block
      newBlocks.set(data.block.pageId, updatedBlocks)
    }

    return newBlocks
  })

  // Dispatch custom event
  window.dispatchEvent(new CustomEvent('block-operation-applied', { detail: data }))
})
