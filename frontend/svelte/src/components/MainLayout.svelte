<script lang="ts">
  import { onMount } from "svelte";
  import {
    groups,
    pages,
    filteredPages,
    currentPage,
    selectedGroupId,
    searchTerm,
    showStarredOnly,
    groupsTree,
    profile,
    storeActions,
  } from "../lib/stores";
  import PageEditor from "./PageEditor.svelte";
  import ProfileModal from "./ProfileModal.svelte";
  import GroupModal from "./GroupModal.svelte";
  import InviteModal from "./InviteModal.svelte";
  import type { Group, Page } from "../lib/ipc";

  let showProfileModal = false;
  let showGroupModal = false;
  let showInviteModal = false;
  let editingGroup: Group | null = null;
  let sidebarWidth = 280;

  // Search and filter states
  let localSearchTerm = "";

  $: searchTerm.set(localSearchTerm);

  async function createPage() {
    const page = await storeActions.createPage(
      "Untitled Page",
      "",
      $selectedGroupId || undefined,
    );
    currentPage.set(page);
  }

  async function selectPage(page: Page) {
    await storeActions.loadPage(page.id);
  }

  function selectGroup(groupId: string | null) {
    selectedGroupId.set(groupId);
    currentPage.set(null);
  }

  function editGroup(group: Group) {
    editingGroup = group;
    showGroupModal = true;
  }

  function createGroup(parentId?: string) {
    editingGroup = null;
    selectedGroupId.set(parentId || null);
    showGroupModal = true;
  }

  async function deleteGroup(group: Group) {
    if (confirm(`Delete "${group.name}" and all its pages?`)) {
      await storeActions.deleteGroup(group.id);
    }
  }

  async function deletePage(page: Page) {
    if (confirm(`Delete "${page.title}"?`)) {
      await storeActions.deletePage(page.id);
    }
  }

  function onGroupModalClose() {
    showGroupModal = false;
    editingGroup = null;
  }
</script>

<div class="main-layout">
  <!-- Sidebar -->
  <div class="sidebar" style="width: {sidebarWidth}px">
    <!-- Profile Section -->
    <div class="profile-section">
      <div class="profile-info" on:click={() => (showProfileModal = true)}>
        <div class="avatar">
          {$profile?.displayName?.charAt(0) || "?"}
        </div>
        <div class="name">{$profile?.displayName || "Unknown User"}</div>
      </div>
      <button
        class="btn-icon"
        on:click={() => (showInviteModal = true)}
        title="Share Vault"
      >
        📤
      </button>
    </div>

    <!-- Search -->
    <div class="search-section">
      <input
        type="text"
        placeholder="Search pages..."
        bind:value={localSearchTerm}
        class="search-input"
      />
      <button
        class="star-filter"
        class:active={$showStarredOnly}
        on:click={() => showStarredOnly.set(!$showStarredOnly)}
        title="Show starred only"
      >
        ⭐
      </button>
    </div>

    <!-- Navigation -->
    <div class="nav-section">
      <!-- All Pages -->
      <div
        class="nav-item"
        class:active={$selectedGroupId === null}
        on:click={() => selectGroup(null)}
      >
        <span class="nav-icon">📄</span>
        <span class="nav-label">All Pages</span>
        <span class="nav-count">{$pages.length}</span>
      </div>

      <!-- Groups -->
      <div class="groups-header">
        <span>Groups</span>
        <button
          class="btn-icon"
          on:click={() => createGroup()}
          title="Create Group"
        >
          ➕
        </button>
      </div>

      {#each $groupsTree as group (group.id)}
        <div class="group-tree">
          <div
            class="nav-item group-item"
            class:active={$selectedGroupId === group.id}
            on:click={() => selectGroup(group.id)}
          >
            <span class="nav-icon">📁</span>
            <span class="nav-label">{group.name}</span>
            <span class="nav-count"
              >{$pages.filter((p) => p.groupId === group.id).length}</span
            >
            <div class="group-actions">
              <button
                class="btn-icon"
                on:click|stopPropagation={() => createGroup(group.id)}
                >➕</button
              >
              <button
                class="btn-icon"
                on:click|stopPropagation={() => editGroup(group)}>✏️</button
              >
              <button
                class="btn-icon"
                on:click|stopPropagation={() => deleteGroup(group)}>🗑️</button
              >
            </div>
          </div>

          {#if group.children.length > 0}
            <div class="subgroups">
              {#each group.children as subgroup (subgroup.id)}
                <div
                  class="nav-item subgroup-item"
                  class:active={$selectedGroupId === subgroup.id}
                  on:click={() => selectGroup(subgroup.id)}
                >
                  <span class="nav-icon">📁</span>
                  <span class="nav-label">{subgroup.name}</span>
                  <span class="nav-count"
                    >{$pages.filter((p) => p.groupId === subgroup.id)
                      .length}</span
                  >
                  <div class="group-actions">
                    <button
                      class="btn-icon"
                      on:click|stopPropagation={() => editGroup(subgroup)}
                      >✏️</button
                    >
                    <button
                      class="btn-icon"
                      on:click|stopPropagation={() => deleteGroup(subgroup)}
                      >🗑️</button
                    >
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Pages List -->
    <div class="pages-section">
      <div class="pages-header">
        <span>Pages</span>
        <button class="btn-icon" on:click={createPage} title="Create Page">
          ➕
        </button>
      </div>

      <div class="pages-list">
        {#each $filteredPages as page (page.id)}
          <div
            class="page-item"
            class:active={$currentPage?.id === page.id}
            on:click={() => selectPage(page)}
          >
            <div class="page-info">
              <div class="page-title">
                {#if page.starred}⭐{/if}
                {page.title}
              </div>
              <div class="page-meta">
                {new Date(page.updatedAt).toLocaleDateString()}
                {#if page.tags.length > 0}
                  • {page.tags.join(", ")}
                {/if}
              </div>
            </div>
            <button
              class="btn-icon delete-page"
              on:click|stopPropagation={() => deletePage(page)}
              title="Delete page"
            >
              🗑️
            </button>
          </div>
        {/each}

        {#if $filteredPages.length === 0}
          <div class="empty-pages">
            {#if $searchTerm}
              No pages found matching "{$searchTerm}"
            {:else if $selectedGroupId}
              No pages in this group
            {:else}
              No pages yet. Create your first page!
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Resize Handle -->
  <div class="resize-handle"></div>

  <!-- Main Content -->
  <div class="main-content">
    {#if $currentPage}
      <PageEditor page={$currentPage} />
    {:else}
      <div class="welcome-screen">
        <h2>Welcome to Autonote</h2>
        <p>
          Select a page from the sidebar or create a new one to get started.
        </p>
        <button class="btn-primary" on:click={createPage}>
          Create New Page
        </button>
      </div>
    {/if}
  </div>
</div>

<!-- Modals -->
{#if showProfileModal}
  <ProfileModal on:close={() => (showProfileModal = false)} />
{/if}

{#if showGroupModal}
  <GroupModal
    group={editingGroup}
    parentId={editingGroup?.parentId || $selectedGroupId}
    on:close={onGroupModalClose}
  />
{/if}

{#if showInviteModal}
  <InviteModal on:close={() => (showInviteModal = false)} />
{/if}

<style>
  .main-layout {
    display: flex;
    height: 100vh;
    background-color: #f8f9fa;
  }

  .sidebar {
    background: white;
    border-right: 1px solid #e0e0e0;
    display: flex;
    flex-direction: column;
    min-width: 240px;
    max-width: 400px;
  }

  .profile-section {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid #e0e0e0;
  }

  .profile-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    flex: 1;
  }

  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #4a90e2;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
  }

  .name {
    font-weight: 500;
    color: #333;
  }

  .search-section {
    padding: 1rem;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    gap: 0.5rem;
  }

  .search-input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.9rem;
  }

  .star-filter {
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.2s;
  }

  .star-filter.active {
    opacity: 1;
    background: #fff3cd;
  }

  .nav-section {
    padding: 1rem;
    border-bottom: 1px solid #e0e0e0;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
    margin-bottom: 0.25rem;
  }

  .nav-item:hover {
    background-color: #f5f5f5;
  }

  .nav-item.active {
    background-color: #e3f2fd;
    color: #1976d2;
  }

  .nav-icon {
    font-size: 1rem;
  }

  .nav-label {
    flex: 1;
    font-size: 0.9rem;
  }

  .nav-count {
    font-size: 0.8rem;
    color: #666;
    background: #f0f0f0;
    padding: 0.125rem 0.375rem;
    border-radius: 10px;
  }

  .groups-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 1rem 0 0.5rem 0;
    font-weight: 600;
    color: #666;
    font-size: 0.8rem;
    text-transform: uppercase;
  }

  .group-actions {
    display: none;
    gap: 0.25rem;
  }

  .group-item:hover .group-actions,
  .subgroup-item:hover .group-actions {
    display: flex;
  }

  .subgroups {
    margin-left: 1rem;
  }

  .subgroup-item {
    font-size: 0.85rem;
  }

  .pages-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .pages-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    font-weight: 600;
    color: #666;
    font-size: 0.8rem;
    text-transform: uppercase;
    border-bottom: 1px solid #e0e0e0;
  }

  .pages-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .page-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
    margin-bottom: 0.25rem;
  }

  .page-item:hover {
    background-color: #f5f5f5;
  }

  .page-item.active {
    background-color: #e3f2fd;
    color: #1976d2;
  }

  .page-info {
    flex: 1;
    min-width: 0;
  }

  .page-title {
    font-weight: 500;
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .page-meta {
    font-size: 0.75rem;
    color: #666;
    margin-top: 0.25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .delete-page {
    opacity: 0;
    transition: opacity 0.2s;
  }

  .page-item:hover .delete-page {
    opacity: 1;
  }

  .empty-pages {
    text-align: center;
    padding: 2rem;
    color: #666;
    font-size: 0.9rem;
  }

  .btn-icon {
    background: none;
    border: none;
    padding: 0.25rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
    transition: background-color 0.2s;
  }

  .btn-icon:hover {
    background-color: #f0f0f0;
  }

  .resize-handle {
    width: 4px;
    background: #e0e0e0;
    cursor: ew-resize;
  }

  .main-content {
    flex: 1;
    overflow: hidden;
  }

  .welcome-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    padding: 2rem;
  }

  .welcome-screen h2 {
    margin-bottom: 1rem;
    color: #333;
  }

  .welcome-screen p {
    margin-bottom: 2rem;
    color: #666;
    max-width: 400px;
  }

  .btn-primary {
    background-color: #4a90e2;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .btn-primary:hover {
    background-color: #357abd;
  }
</style>

