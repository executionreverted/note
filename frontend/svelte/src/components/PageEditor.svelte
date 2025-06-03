<!-- frontend/svelte/src/components/PageEditor.svelte -->
<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { storeActions, currentPage } from "../lib/stores";
  import type { Page } from "../lib/ipc";
  import BlockEditor from "./BlockEditor.svelte";

  export let page: Page;

  const dispatch = createEventDispatcher();

  let title = "";
  let tags = "";
  let starred = false;
  let isEditing = false;
  let hasUnsavedChanges = false;
  let saveTimeout: ReturnType<typeof setTimeout>;
  let currentPageId = "";
  let lastKnownVersion = 0;
  let isMigrating = false;
  let hasMigrated = false;
  let blockCount = 0;

  // Watch for external updates to currentPage
  $: if (
    $currentPage &&
    $currentPage.id === currentPageId &&
    $currentPage.updatedAt > lastKnownVersion
  ) {
    if (!hasUnsavedChanges) {
      loadPageContent($currentPage);
    }
  }

  // Update local state when page prop changes
  $: if (page && page.id !== currentPageId) {
    loadPageContent(page);
    checkBlocksMigration();
  }

  // Auto-save after 30 seconds of inactivity
  $: if (hasUnsavedChanges && isEditing) {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      if (hasUnsavedChanges) {
        savePage();
      }
    }, 30000);
  }

  async function checkBlocksMigration() {
    if (!page?.id) return;

    try {
      const blocks = await storeActions.getBlocksByPage(page.id);
      blockCount = blocks.length;
      hasMigrated = blockCount > 0;
      console.log(
        `Page ${page.id} has ${blockCount} blocks, migrated: ${hasMigrated}`,
      );
    } catch (error) {
      console.error("Failed to check blocks:", error);
      hasMigrated = false;
      blockCount = 0;
    }
  }

  async function migrateToBlocks() {
    if (!page || !page.id) return;

    isMigrating = true;
    try {
      console.log("Starting migration for page:", page.id);
      const blocks = await storeActions.migratePageToBlocks(page.id);
      console.log("Migration completed, created blocks:", blocks.length);

      blockCount = blocks.length;
      hasMigrated = true;

      // Clear the page content since it's now in blocks
      if (blocks.length > 0) {
        await storeActions.updatePage(page.id, { content: "" });
      }
    } catch (error) {
      console.error("Failed to migrate page:", error);
      alert("Failed to migrate page to blocks: " + error.message);
    } finally {
      isMigrating = false;
    }
  }

  async function loadPageContent(pageData: Page) {
    if (!pageData) return;

    title = pageData.title;
    tags = pageData.tags.join(", ");
    starred = pageData.starred || false;
    currentPageId = pageData.id;
    lastKnownVersion = pageData.updatedAt;
    hasUnsavedChanges = false;
    isEditing = false;
    clearTimeout(saveTimeout);

    // Check if this page has been migrated to blocks
    await checkBlocksMigration();
  }

  function markDirty() {
    if (!hasUnsavedChanges) {
      hasUnsavedChanges = true;
    }
  }

  function startEditing() {
    isEditing = true;
  }

  function stopEditing() {
    isEditing = false;
    if (hasUnsavedChanges) {
      savePage();
    }
  }

  async function savePage() {
    if (!hasUnsavedChanges || !currentPageId) return;

    try {
      await saveWithoutConflictCheck();
    } catch (error) {
      console.error("Failed to save page:", error);
    }
  }

  async function saveWithoutConflictCheck() {
    const tagsArray = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const updated = await storeActions.updatePage(
      currentPageId,
      {
        title: title.trim() || "Untitled",
        tags: tagsArray,
        starred,
      },
      lastKnownVersion,
    );

    hasUnsavedChanges = false;
    lastKnownVersion = updated.updatedAt;
    clearTimeout(saveTimeout);
  }

  async function deletePage() {
    if (confirm(`Delete "${page.title}"?`)) {
      await storeActions.deletePage(page.id);
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === "s") {
      event.preventDefault();
      savePage();
    }
  }

  onMount(() => {
    if (page) {
      loadPageContent(page);
    }
  });

  onDestroy(() => {
    clearTimeout(saveTimeout);
  });
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="page-editor">
  <!-- Header -->
  <div class="editor-header">
    <div class="title-section">
      <input
        type="text"
        bind:value={title}
        on:input={markDirty}
        on:focus={startEditing}
        on:blur={stopEditing}
        class="title-input"
        placeholder="Page title..."
      />
      <button
        class="star-btn"
        class:starred
        on:click={() => {
          starred = !starred;
          markDirty();
          startEditing();
        }}
        title={starred ? "Remove from favorites" : "Add to favorites"}
      >
        {starred ? "*" : " "}
      </button>
    </div>

    <div class="header-actions">
      <button
        class="btn-primary"
        on:click={savePage}
        disabled={!hasUnsavedChanges}
        title="Save (Ctrl+S)"
      >
        {hasUnsavedChanges ? "Save*" : "Saved"}
      </button>
      <button class="btn-secondary" on:click={deletePage} title="Delete page">
        Delete
      </button>
    </div>
  </div>

  <!-- Tags -->
  <div class="tags-section">
    <input
      type="text"
      bind:value={tags}
      on:input={markDirty}
      on:focus={startEditing}
      on:blur={stopEditing}
      class="tags-input"
      placeholder="Tags (comma separated)..."
    />
  </div>

  <!-- Migration Banner (only show if not migrated and has content) -->
  {#if !hasMigrated && !isMigrating && page.content}
    <div class="migration-banner">
      <div class="migration-info">
        <p>
          <strong>Upgrade Available:</strong> This page uses the legacy editor. Migrate
          to the new block-based editor for better collaboration and formatting.
        </p>
        <small>Your content will be automatically converted to blocks.</small>
      </div>
      <button
        class="btn-primary"
        on:click={migrateToBlocks}
        disabled={isMigrating}
      >
        {isMigrating ? "Migrating..." : "Migrate to Blocks"}
      </button>
    </div>
  {/if}

  <!-- Migration Status -->
  {#if isMigrating}
    <div class="migration-status">
      <div class="spinner"></div>
      <span>Converting your content to blocks...</span>
    </div>
  {/if}

  <!-- Block Editor (show if migrated or no content) -->
  {#if hasMigrated || (!page.content && !isMigrating)}
    <BlockEditor pageId={page.id} readOnly={false} />
  {:else if page.content && !hasMigrated && !isMigrating}
    <!-- Show legacy content with migration prompt -->
    <div class="legacy-content">
      <div class="legacy-preview">
        <h3>Legacy Content Preview:</h3>
        <div class="content-preview">
          {page.content.substring(0, 300)}{page.content.length > 300
            ? "..."
            : ""}
        </div>
        <p class="migration-note">
          <em
            >This content will be converted to editable blocks after migration.</em
          >
        </p>
      </div>
    </div>
  {/if}

  <!-- Status -->
  <div class="editor-status">
    <span class="last-modified">
      Last modified: {new Date(page.updatedAt).toLocaleString()}
    </span>
    <div class="status-indicators">
      {#if blockCount > 0}
        <span class="block-count">{blockCount} blocks</span>
      {/if}
      {#if hasUnsavedChanges}
        <span class="unsaved-status">Unsaved changes</span>
      {/if}
      {#if isEditing}
        <span class="editing-status">Editing</span>
      {/if}
    </div>
  </div>
</div>

<style>
  .page-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: white;
  }

  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid #e0e0e0;
  }

  .title-section {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
  }

  .title-input {
    font-size: 1.5rem;
    font-weight: 600;
    border: none;
    outline: none;
    background: transparent;
    flex: 1;
    padding: 0.25rem;
    border-radius: 4px;
  }

  .title-input:focus {
    background: #f8f9fa;
  }

  .star-btn {
    background: none;
    border: none;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    transition: background-color 0.2s;
  }

  .star-btn:hover {
    background: #f0f0f0;
  }

  .star-btn.starred {
    color: #ffc107;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .btn-primary {
    background: #4a90e2;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: background-color 0.2s;
  }

  .btn-primary:hover:not(:disabled) {
    background: #357abd;
  }

  .btn-primary:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: background-color 0.2s;
  }

  .btn-secondary:hover {
    background: #e9ecef;
  }

  .tags-section {
    padding: 0.5rem 1rem;
    border-bottom: 1px solid #e0e0e0;
  }

  .tags-input {
    width: 100%;
    border: none;
    outline: none;
    background: transparent;
    padding: 0.25rem;
    font-size: 0.875rem;
    color: #666;
    border-radius: 4px;
  }

  .tags-input:focus {
    background: #f8f9fa;
  }

  .migration-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    margin: 1rem;
    background: linear-gradient(135deg, #e3f2fd 0%, #f8f9fa 100%);
    border: 1px solid #4a90e2;
    border-radius: 8px;
    gap: 1rem;
  }

  .migration-info p {
    margin: 0 0 0.25rem 0;
    color: #333;
  }

  .migration-info small {
    color: #666;
    font-size: 0.8rem;
  }

  .migration-status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 2rem;
    color: #666;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid #e0e0e0;
    border-radius: 50%;
    border-top-color: #4a90e2;
    animation: spin 1s ease-in-out infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .legacy-content {
    padding: 1rem;
    flex: 1;
  }

  .legacy-preview {
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    padding: 1.5rem;
    max-width: 800px;
    margin: 0 auto;
  }

  .legacy-preview h3 {
    margin: 0 0 1rem 0;
    color: #333;
  }

  .content-preview {
    background: white;
    padding: 1rem;
    border-radius: 4px;
    border: 1px solid #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      sans-serif;
    line-height: 1.6;
    white-space: pre-wrap;
    margin-bottom: 1rem;
  }

  .migration-note {
    color: #666;
    font-style: italic;
    margin: 0;
    text-align: center;
  }

  .editor-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    border-top: 1px solid #e0e0e0;
    background: #f8f9fa;
    font-size: 0.75rem;
    color: #6c757d;
  }

  .status-indicators {
    display: flex;
    gap: 1rem;
  }

  .block-count {
    color: #4a90e2;
    font-weight: 500;
  }

  .unsaved-status {
    color: #dc3545;
    font-weight: 500;
  }

  .editing-status {
    color: #28a745;
  }
</style>

