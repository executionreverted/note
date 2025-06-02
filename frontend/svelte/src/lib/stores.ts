// frontend/svelte/src/lib/stores.ts
import { writable, derived } from 'svelte/store'
import type { Profile, Group, Page, Vault } from './ipc'
import { ipc } from './ipc'

// App state
export const isVaultOpen = writable<boolean>(false)
export const currentVault = writable<Vault | null>(null)
export const isLoading = writable<boolean>(false)

// User profile
export const profile = writable<Profile | null>(null)

// Groups (folders)
export const groups = writable<Group[]>([])

// Pages
export const pages = writable<Page[]>([])
export const currentPage = writable<Page | null>(null)

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

export function showToast(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  const id = `toast-${++toastId}`
  toasts.update(items => [...items, { id, message, type }])

  // Auto-remove after 4 seconds
  setTimeout(() => {
    toasts.update(items => items.filter(item => item.id !== id))
  }, 4000)
}

// Derived stores
export const filteredPages = derived(
  [pages, selectedGroupId, searchTerm, showStarredOnly],
  ([$pages, $selectedGroupId, $searchTerm, $showStarredOnly]) => {
    let filtered = $pages

    // Filter by group
    if ($selectedGroupId) {
      filtered = filtered.filter(page => page.groupId === $selectedGroupId)
    }

    // Filter by starred
    if ($showStarredOnly) {
      filtered = filtered.filter(page => page.starred)
    }

    // Filter by search term
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

  // Initialize all groups with children array
  $groups.forEach(group => {
    groupMap.set(group.id, { ...group, children: [] })
  })

  // Build tree structure
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

      // Set up real-time sync listener
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
    syncStatus.set('offline')
  },

  setupRealTimeSync() {
    // Listen for Autonote 'update' events from backend
    ipc.on('vault:realtime-update', async () => {
      console.log('Real-time update received from peer')
      syncStatus.set('syncing')

      try {
        await this.loadVaultData()
        lastSyncTime.set(Date.now())
        syncStatus.set('synced')

        // Show subtle notification
        this.showSyncNotification('Changes synced from peer')
      } catch (error) {
        console.error('Failed to sync updates:', error)
        syncStatus.set('error')
      }
    })
  },

  showSyncNotification(message: string) {
    showToast(message, 'info')
  },

  async loadVaultData() {
    const [profileData, groupsData, pagesData] = await Promise.all([
      ipc.getProfile(),
      ipc.listGroups(),
      ipc.listPages()
    ])

    profile.set(profileData)
    groups.set(groupsData)

    // Update pages and check if current page changed
    const currentPageId = currentPage.subscribe(page => page?.id)
    pages.set(pagesData)

    // Refresh current page if it was updated by peer
    const current = currentPage.subscribe(page => {
      if (page) {
        const updatedPage = pagesData.find(p => p.id === page.id)
        if (updatedPage && updatedPage.updatedAt > page.updatedAt) {
          console.log(`Page "${updatedPage.title}" was updated by peer`)
          currentPage.set(updatedPage)
        }
      }
    })
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
    syncStatus.set('synced')
    lastSyncTime.set(Date.now())
    return page
  },

  async updatePage(id: string, updates: Partial<Page>) {
    syncStatus.set('syncing')
    const updated = await ipc.updatePage(id, updates)
    pages.update(items => items.map(item => item.id === id ? updated : item))

    // Update current page if it's the one being updated
    currentPage.update(current => current?.id === id ? updated : current)
    syncStatus.set('synced')
    lastSyncTime.set(Date.now())
    return updated
  },

  async deletePage(id: string) {
    syncStatus.set('syncing')
    await ipc.deletePage(id)
    pages.update(items => items.filter(item => item.id !== id))

    // Clear current page if it's the one being deleted
    currentPage.update(current => current?.id === id ? null : current)
    syncStatus.set('synced')
    lastSyncTime.set(Date.now())
  },

  async loadPage(id: string) {
    const page = await ipc.getPage(id)
    currentPage.set(page)
    return page
  },

  // Search actions
  async searchPages(term: string) {
    searchTerm.set(term)
    if (term.trim()) {
      const results = await ipc.searchPages(term)
      return results
    }
    return []
  }
}

// Set up IPC event listeners for real-time updates
ipc.on('vault:update', () => {
  console.log('Vault update event received')
  storeActions.loadVaultData()
})

// Individual entity updates from peers
ipc.on('profile:updated', (data: Profile) => {
  console.log('Profile updated by peer:', data.displayName)
  profile.set(data)
  storeActions.showSyncNotification('Profile updated by peer')
})

ipc.on('group:created', (data: Group) => {
  console.log('Group created by peer:', data.name)
  groups.update(items => [...items, data])
  storeActions.showSyncNotification(`Group "${data.name}" created by peer`)
})

ipc.on('group:updated', (data: Group) => {
  console.log('Group updated by peer:', data.name)
  groups.update(items => items.map(item => item.id === data.id ? data : item))
  storeActions.showSyncNotification(`Group "${data.name}" updated by peer`)
})

ipc.on('group:deleted', (data: { id: string }) => {
  console.log('Group deleted by peer:', data.id)
  groups.update(items => items.filter(item => item.id !== data.id))
  storeActions.showSyncNotification('Group deleted by peer')
})

ipc.on('page:created', (data: Page) => {
  console.log('Page created by peer:', data.title)
  pages.update(items => [data, ...items])
  storeActions.showSyncNotification(`Page "${data.title}" created by peer`)
})

ipc.on('page:updated', (data: Page) => {
  console.log('Page updated by peer:', data.title)
  pages.update(items => items.map(item => item.id === data.id ? data : item))

  // If this is the currently open page, show it was updated
  const current = currentPage.subscribe(page => {
    if (page?.id === data.id) {
      currentPage.set(data)
      storeActions.showSyncNotification(`"${data.title}" was updated by peer`)
    }
  })
})

ipc.on('page:deleted', (data: { id: string }) => {
  console.log('Page deleted by peer:', data.id)
  pages.update(items => items.filter(item => item.id !== data.id))
  currentPage.update(current => current?.id === data.id ? null : current)
  storeActions.showSyncNotification('Page deleted by peer')
})
