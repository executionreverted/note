<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import { storeActions } from "../lib/stores";
  import type { Page } from "../lib/ipc";

  export let page: Page;

  const dispatch = createEventDispatcher();

  let title = page.title;
  let content = page.content || "";
  let tags = page.tags.join(", ");
  let starred = page.starred || false;
  let isEditing = false;
  let saveTimeout: ReturnType<typeof setTimeout>;

  // Auto-save functionality
  $: if (
    isEditing &&
    (title !== page.title ||
      content !== page.content ||
      tags !== page.tags.join(", ") ||
      starred !== page.starred)
  ) {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(savePage, 1000); // Auto-save after 1 second of inactivity
  }

  async function savePage() {
    if (!isEditing) return;

    const tagsArray = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    try {
      await storeActions.updatePage(page.id, {
        title: title.trim() || "Untitled",
        content,
        tags: tagsArray,
        starred,
      });
    } catch (error) {
      console.error("Failed to save page:", error);
    }
  }

  function startEditing() {
    isEditing = true;
  }

  function stopEditing() {
    isEditing = false;
    savePage();
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

    // Restore focus and selection
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + replacement.length,
        start + replacement.length,
      );
    }, 0);
  }

  // Simple markdown renderer (you might want to use a proper markdown library)
  function renderMarkdown(text: any) {
    if (!text) return '<p class="placeholder">Start writing your note...</p>';

    return (
      text
        // Headers
        .replace(/^### (.*$)/gim, "<h3>$1</h3>")
        .replace(/^## (.*$)/gim, "<h2>$1</h2>")
        .replace(/^# (.*$)/gim, "<h1>$1</h1>")
        // Bold
        .replace(/\*\*(.*)\*\*/gim, "<strong>$1</strong>")
        // Italic
        .replace(/\*(.*)\*/gim, "<em>$1</em>")
        // Code
        .replace(/`(.*?)`/gim, "<code>$1</code>")
        // Links
        .replace(
          /\[([^\]]+)\]\(([^)]+)\)/gim,
          '<a href="$2" target="_blank">$1</a>',
        )
        // Line breaks
        .replace(/\n/gim, "<br>")
        // Quotes
        .replace(/^> (.*$)/gim, "<blockquote>$1</blockquote>")
        // Lists
        .replace(/^\* (.*$)/gim, "<li>$1</li>")
        .replace(/^- (.*$)/gim, "<li>$1</li>")
        .replace(/^(\d+)\. (.*$)/gim, "<li>$2</li>")
    );
  }

  onMount(() => {
    // Set initial values when page changes
    title = page.title;
    content = page.content || "";
    tags = page.tags.join(", ");
    starred = page.starred || false;
  });

  // Update when page prop changes
  $: if (page) {
    title = page.title;
    content = page.content || "";
    tags = page.tags.join(", ");
    starred = page.starred || false;
    isEditing = false;
  }
</script>

<div class="page-editor">
  <!-- Header -->
  <div class="editor-header">
    <div class="title-section">
      <input
        type="text"
        bind:value={title}
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
          startEditing();
        }}
        title={starred ? "Remove from favorites" : "Add to favorites"}
      >
        {starred ? "*" : " "}
      </button>
    </div>

    <div class="header-actions">
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
      <button on:click={() => formatText("code")} title="Code">
        &lt;/&gt;
      </button>
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
        1. List
      </button>
      <button on:click={() => formatText("quote")} title="Quote">
        " Quote
      </button>
    </div>
  </div>

  <!-- Content Editor -->
  <div class="editor-content">
    <div class="editor-pane">
      <textarea
        id="content-editor"
        bind:value={content}
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
    {#if isEditing}
      <span class="save-status">Saving...</span>
    {/if}
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
    font-size: 1.25rem;
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

  .save-status {
    color: #28a745;
  }
</style>
