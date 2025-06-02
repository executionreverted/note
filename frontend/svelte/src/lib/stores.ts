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
  },

  async loadVaultData() {
    const [profileData, groupsData, pagesData] = await Promise.all([
      ipc.getProfile(),
      ipc.listGroups(),
      ipc.listPages()
    ])

    profile.set(profileData)
    groups.set(groupsData)
    pages.set(pagesData)
  },

  // Profile actions
  async updateProfile(updates: Partial<Profile>) {
    const updated = await ipc.updateProfile(updates)
    profile.set(updated)
  },

  // Group actions
  async createGroup(name: string, parentId?: string, options?: { color?: string, icon?: string }) {
    const group = await ipc.createGroup(name, parentId, options)
    groups.update(items => [...items, group])
    return group
  },

  async updateGroup(id: string, updates: Partial<Group>) {
    const updated = await ipc.updateGroup(id, updates)
    groups.update(items => items.map(item => item.id === id ? updated : item))
    return updated
  },

  async deleteGroup(id: string) {
    await ipc.deleteGroup(id)
    groups.update(items => items.filter(item => item.id !== id))
    // Also remove pages in this group
    pages.update(items => items.filter(item => item.groupId !== id))
  },

  // Page actions
  async createPage(title: string, content?: string, groupId?: string, options?: { tags?: string[], starred?: boolean }) {
    const page = await ipc.createPage(title, content, groupId, options)
    pages.update(items => [page, ...items])
    return page
  },

  async updatePage(id: string, updates: Partial<Page>) {
    const updated = await ipc.updatePage(id, updates)
    pages.update(items => items.map(item => item.id === id ? updated : item))

    // Update current page if it's the one being updated
    currentPage.update(current => current?.id === id ? updated : current)
    return updated
  },

  async deletePage(id: string) {
    await ipc.deletePage(id)
    pages.update(items => items.filter(item => item.id !== id))

    // Clear current page if it's the one being deleted
    currentPage.update(current => current?.id === id ? null : current)
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

// Set up IPC event listeners
ipc.on('vault:update', () => {
  storeActions.loadVaultData()
})

ipc.on('profile:updated', (data: Profile) => {
  profile.set(data)
})

ipc.on('group:created', (data: Group) => {
  groups.update(items => [...items, data])
})

ipc.on('group:updated', (data: Group) => {
  groups.update(items => items.map(item => item.id === data.id ? data : item))
})

ipc.on('group:deleted', (data: { id: string }) => {
  groups.update(items => items.filter(item => item.id !== data.id))
})

ipc.on('page:created', (data: Page) => {
  pages.update(items => [data, ...items])
})

ipc.on('page:updated', (data: Page) => {
  pages.update(items => items.map(item => item.id === data.id ? data : item))
  currentPage.update(current => current?.id === data.id ? data : current)
})

ipc.on('page:deleted', (data: { id: string }) => {
  pages.update(items => items.filter(item => item.id !== data.id))
  currentPage.update(current => current?.id === data.id ? null : current)
})
