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
let currentPageId: string | null = null

export function showToast(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  const id = `toast-${++toastId}`
  toasts.update(items => [...items, { id, message, type }])

  // Auto-remove after 4 seconds
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
    console.log('Setting up real-time sync listeners')

    // Remove any existing listeners first
    ipc.off('vault:realtime-update', this.handleRealTimeUpdate)
    ipc.off('vault:update', this.handleVaultUpdate)

    // Set up new listeners
    ipc.on('vault:realtime-update', this.handleRealTimeUpdate)
    ipc.on('vault:update', this.handleVaultUpdate)
  },

  handleRealTimeUpdate: async () => {
    console.log('🔄 Real-time update received from peer')
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
    console.log('📄 Vault update event received')
    await storeActions.loadVaultData()
  },

  async loadVaultData() {
    try {
      const [profileData, groupsData, pagesData] = await Promise.all([
        ipc.getProfile(),
        ipc.listGroups(),
        ipc.listPages()
      ])

      console.log('📊 Loading vault data:', {
        profile: profileData?.displayName,
        groups: groupsData.length,
        pages: pagesData.length
      })

      profile.set(profileData)
      groups.set(groupsData)
      pages.set(pagesData)

      // Force refresh current page if it was updated
      if (currentPageId) {
        const updatedCurrentPage = pagesData.find(p => p.id === currentPageId)
        if (updatedCurrentPage) {
          // Force a new object reference to trigger reactivity
          currentPage.set({ ...updatedCurrentPage })
          console.log('🔄 Current page refreshed:', updatedCurrentPage.title, 'Content length:', updatedCurrentPage.content?.length)
        }
      }
    } catch (error) {
      console.error('Failed to load vault data:', error)
      throw error
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
    syncStatus.set('synced')
    lastSyncTime.set(Date.now())
    return page
  },

  async updatePage(id: string, updates: Partial<Page>) {
    syncStatus.set('syncing')
    const updated = await ipc.updatePage(id, updates)
    pages.update(items => items.map(item => item.id === id ? updated : item))

    // Update current page if it's the one being updated
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

    // Clear current page if it's the one being deleted
    if (currentPageId === id) {
      currentPage.set(null)
    }

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

// Set up individual entity update listeners
ipc.on('profile:updated', (data: Profile) => {
  console.log('👤 Profile updated by peer:', data.displayName)
  profile.set(data)
  showToast('Profile updated by peer', 'info')
})

ipc.on('group:created', (data: Group) => {
  console.log('📁 Group created by peer:', data.name)
  groups.update(items => [...items, data])
  showToast(`Group "${data.name}" created by peer`, 'success')
})

ipc.on('group:updated', (data: Group) => {
  console.log('📁 Group updated by peer:', data.name)
  groups.update(items => items.map(item => item.id === data.id ? data : item))
  showToast(`Group "${data.name}" updated by peer`, 'info')
})

ipc.on('group:deleted', (data: { id: string }) => {
  console.log('🗑️ Group deleted by peer:', data.id)
  groups.update(items => items.filter(item => item.id !== data.id))
  showToast('Group deleted by peer', 'warning')
})

ipc.on('page:created', (data: Page) => {
  console.log('📄 Page created by peer:', data.title)
  pages.update(items => [data, ...items])
  showToast(`Page "${data.title}" created by peer`, 'success')
})

ipc.on('page:updated', (data: Page) => {
  console.log('✏️ Page updated by peer:', data.title)
  pages.update(items => items.map(item => item.id === data.id ? data : item))

  // Update current page if it's the one being updated
  if (currentPageId === data.id) {
    currentPage.set(data)
    showToast(`"${data.title}" was updated by peer`, 'info')
  }
})

ipc.on('page:deleted', (data: { id: string }) => {
  console.log('🗑️ Page deleted by peer:', data.id)
  pages.update(items => items.filter(item => item.id !== data.id))

  if (currentPageId === data.id) {
    currentPage.set(null)
  }

  showToast('Page deleted by peer', 'warning')
})
