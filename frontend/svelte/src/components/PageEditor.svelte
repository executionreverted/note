<!-- frontend/svelte/src/components/PageEditor.svelte -->
<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { storeActions, currentPage } from "../lib/stores";
  import type { Page } from "../lib/ipc";
  import { ipc } from "../lib/ipc";

  export let page: Page;

  const dispatch = createEventDispatcher();

  let title = "";
  let content = "";
  let tags = "";
  let starred = false;
  let isEditing = false;
  let hasUnsavedChanges = false;
  let saveTimeout: ReturnType<typeof setTimeout>;
  let currentPageId = "";
  let lastKnownVersion = 0;
  let showConflictDialog = false;
  let conflictData = null;

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

  function loadPageContent(pageData: Page) {
    if (!pageData) return;

    title = pageData.title;
    content = pageData.content || "";
    tags = pageData.tags.join(", ");
    starred = pageData.starred || false;
    currentPageId = pageData.id;
    lastKnownVersion = pageData.updatedAt;
    hasUnsavedChanges = false;
    isEditing = false;
    clearTimeout(saveTimeout);
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
        content,
        tags: tagsArray,
        starred,
      },
      lastKnownVersion,
    );

    hasUnsavedChanges = false;
    lastKnownVersion = updated.updatedAt;
    clearTimeout(saveTimeout);
  }

  async function resolveConflict(
    resolution: "keep-ours" | "keep-theirs" | "merge",
  ) {
    if (!conflictData) return;

    try {
      if (resolution === "keep-theirs") {
        title = conflictData.current.title;
        content = conflictData.current.content || "";
        tags = conflictData.current.tags.join(", ");
        starred = conflictData.current.starred || false;
        lastKnownVersion = conflictData.current.updatedAt;
        hasUnsavedChanges = false;
      } else if (resolution === "keep-ours") {
        await saveWithoutConflictCheck();
      } else if (resolution === "merge") {
        const mergedContent =
          content +
          "\n\n--- PEER CHANGES (merged) ---\n" +
          (conflictData.current.content || "");

        content = mergedContent;
        await saveWithoutConflictCheck();
      }

      showConflictDialog = false;
      conflictData = null;
    } catch (error) {
      console.error("Failed to resolve conflict:", error);
    }
  }

  async function deletePage() {
    if (confirm(`Delete "${page.title}"?`)) {
      await storeActions.deletePage(page.id);
    }
  }

  function formatText(format: string) {
    const textarea = document.getElementById(
      "content-editor",
    ) as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);

    let replacement = "";
    switch (format) {
      case "bold":
        replacement = `**${selectedText}**`;
        break;
      case "italic":
        replacement = `*${selectedText}*`;
        break;
      case "code":
        replacement = `\`${selectedText}\``;
        break;
      case "header1":
        replacement = `# ${selectedText}`;
        break;
      case "header2":
        replacement = `## ${selectedText}`;
        break;
      case "header3":
        replacement = `### ${selectedText}`;
        break;
      case "bullet":
        replacement = `- ${selectedText}`;
        break;
      case "number":
        replacement = `1. ${selectedText}`;
        break;
      case "quote":
        replacement = `> ${selectedText}`;
        break;
    }

    content =
      content.substring(0, start) + replacement + content.substring(end);
    markDirty();

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + replacement.length,
        start + replacement.length,
      );
    }, 0);
  }

  function renderMarkdown(text: any) {
    if (!text) return '<p class="placeholder">Start writing your note...</p>';

    return text
      .replace(/^### (.*$)/gim, "<h3>$1</h3>")
      .replace(/^## (.*$)/gim, "<h2>$1</h2>")
      .replace(/^# (.*$)/gim, "<h1>$1</h1>")
      .replace(/\*\*(.*)\*\*/gim, "<strong>$1</strong>")
      .replace(/\*(.*)\*/gim, "<em>$1</em>")
      .replace(/`(.*?)`/gim, "<code>$1</code>")
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/gim,
        '<a href="$2" target="_blank">$1</a>',
      )
      .replace(/\n/gim, "<br>")
      .replace(/^> (.*$)/gim, "<blockquote>$1</blockquote>")
      .replace(/^\* (.*$)/gim, "<li>$1</li>")
      .replace(/^- (.*$)/gim, "<li>$1</li>")
      .replace(/^(\d+)\. (.*$)/gim, "<li>$2</li>");
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

  <!-- Toolbar -->
  <div class="toolbar">
    <div class="toolbar-group">
      <button on:click={() => formatText("bold")} title="Bold">
        <strong>B</strong>
      </button>
      <button on:click={() => formatText("italic")} title="Italic">
        <em>I</em>
      </button>
      <button on:click={() => formatText("code")} title="Code"> Code </button>
    </div>

    <div class="toolbar-group">
      <button on:click={() => formatText("header1")} title="Header 1">
        H1
      </button>
      <button on:click={() => formatText("header2")} title="Header 2">
        H2
      </button>
      <button on:click={() => formatText("header3")} title="Header 3">
        H3
      </button>
    </div>

    <div class="toolbar-group">
      <button on:click={() => formatText("bullet")} title="Bullet List">
        List
      </button>
      <button on:click={() => formatText("number")} title="Numbered List">
        Numbered
      </button>
      <button on:click={() => formatText("quote")} title="Quote">
        Quote
      </button>
    </div>
  </div>

  <!-- Content Editor -->
  <div class="editor-content">
    <div class="editor-pane">
      <textarea
        id="content-editor"
        bind:value={content}
        on:input={markDirty}
        on:focus={startEditing}
        on:blur={stopEditing}
        placeholder="Start writing your note..."
        class="content-textarea"
      ></textarea>
    </div>

    <div class="preview-pane">
      <div class="preview-content">
        {@html renderMarkdown(content)}
      </div>
    </div>
  </div>

  <!-- Status -->
  <div class="editor-status">
    <span class="last-modified">
      Last modified: {new Date(page.updatedAt).toLocaleString()}
    </span>
    <div class="status-indicators">
      {#if hasUnsavedChanges}
        <span class="unsaved-status">Unsaved changes</span>
      {/if}
      {#if isEditing}
        <span class="editing-status">Editing</span>
      {/if}
    </div>
  </div>
</div>

<!-- Conflict Resolution Dialog -->
{#if showConflictDialog && conflictData}
  <div class="modal-backdrop">
    <div class="conflict-modal">
      <div class="modal-header">
        <h2>Merge Conflict</h2>
        <p>This page was modified by another user while you were editing.</p>
      </div>

      <div class="conflict-content">
        <div class="conflict-section">
          <h4>Your Version:</h4>
          <div class="conflict-preview">
            <strong>Title:</strong>
            {conflictData.ours.title}<br />
            <strong>Content:</strong>
            {conflictData.ours.content.substring(0, 200)}{conflictData.ours
              .content.length > 200
              ? "..."
              : ""}
          </div>
        </div>

        <div class="conflict-section">
          <h4>Their Version:</h4>
          <div class="conflict-preview">
            <strong>Title:</strong>
            {conflictData.current.title}<br />
            <strong>Content:</strong>
            {(conflictData.current.content || "").substring(0, 200)}{(
              conflictData.current.content || ""
            ).length > 200
              ? "..."
              : ""}
          </div>
        </div>
      </div>

      <div class="conflict-actions">
        <button
          class="btn-secondary"
          on:click={() => resolveConflict("keep-theirs")}
        >
          Use Their Version
        </button>
        <button class="btn-secondary" on:click={() => resolveConflict("merge")}>
          Merge Both
        </button>
        <button
          class="btn-primary"
          on:click={() => resolveConflict("keep-ours")}
        >
          Keep My Version
        </button>
      </div>
    </div>
  </div>
{/if}

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

  .toolbar {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e0e0e0;
    background: #f8f9fa;
  }

  .toolbar-group {
    display: flex;
    gap: 0.25rem;
  }

  .toolbar button {
    background: white;
    border: 1px solid #dee2e6;
    padding: 0.375rem 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
    transition: background-color 0.2s;
  }

  .toolbar button:hover {
    background: #e9ecef;
  }

  .editor-content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .editor-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .content-textarea {
    flex: 1;
    border: none;
    outline: none;
    padding: 1rem;
    font-family: "Menlo", "Monaco", "Courier New", monospace;
    font-size: 0.875rem;
    line-height: 1.6;
    resize: none;
    background: #fafafa;
  }

  .preview-pane {
    flex: 1;
    border-left: 1px solid #e0e0e0;
    overflow-y: auto;
  }

  .preview-content {
    padding: 1rem;
    line-height: 1.6;
    font-size: 0.875rem;
  }

  .preview-content :global(h1) {
    font-size: 1.5rem;
    margin: 1rem 0 0.5rem 0;
    font-weight: 600;
  }

  .preview-content :global(h2) {
    font-size: 1.25rem;
    margin: 1rem 0 0.5rem 0;
    font-weight: 600;
  }

  .preview-content :global(h3) {
    font-size: 1.1rem;
    margin: 1rem 0 0.5rem 0;
    font-weight: 600;
  }

  .preview-content :global(code) {
    background: #f8f9fa;
    padding: 0.125rem 0.25rem;
    border-radius: 3px;
    font-family: "Menlo", "Monaco", "Courier New", monospace;
    font-size: 0.8rem;
  }

  .preview-content :global(blockquote) {
    border-left: 4px solid #dee2e6;
    padding-left: 1rem;
    margin: 1rem 0;
    color: #6c757d;
  }

  .preview-content :global(li) {
    list-style: disc;
    margin-left: 1.5rem;
    margin-bottom: 0.25rem;
  }

  .preview-content :global(.placeholder) {
    color: #adb5bd;
    font-style: italic;
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

  .unsaved-status {
    color: #dc3545;
    font-weight: 500;
  }

  .editing-status {
    color: #28a745;
  }

  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .conflict-modal {
    background: white;
    border-radius: 8px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    overflow: auto;
  }

  .modal-header {
    padding: 1.5rem;
    border-bottom: 1px solid #e0e0e0;
  }

  .modal-header h2 {
    margin: 0 0 0.5rem 0;
    color: #dc3545;
  }

  .modal-header p {
    margin: 0;
    color: #666;
  }

  .conflict-content {
    padding: 1.5rem;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }

  .conflict-section h4 {
    margin: 0 0 0.5rem 0;
    color: #333;
  }

  .conflict-preview {
    background: #f8f9fa;
    padding: 1rem;
    border-radius: 4px;
    font-size: 0.875rem;
    border: 1px solid #e0e0e0;
  }

  .conflict-actions {
    padding: 1.5rem;
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    border-top: 1px solid #e0e0e0;
  }
</style>

