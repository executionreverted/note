<script lang="ts">
  import { queueLocalOperation } from "../lib/blockSync";
  import CollaborationIndicator from "./CollaborationIndicator.svelte";
  import type { Block } from "../lib/types";
  import {
    onMount,
    onDestroy,
    afterUpdate,
    createEventDispatcher,
  } from "svelte";

  export let block: Block;
  export let readOnly: boolean = false;

  const dispatch = createEventDispatcher();

  let isEditing = false;
  let currentContent = block.content || "";
  let currentMetadata = block.metadata || {};
  let contentElement: HTMLElement;
  let lastSavedContent = currentContent;
  let selectionPosition = 0;
  let updateTimeout: ReturnType<typeof setTimeout>;
  $: blockClass = `block block-${block.type} ${isEditing ? "editing" : ""}`;

  // Update local state when block prop changes from external source
  $: if (block && block.content !== lastSavedContent) {
    currentContent = block.content;
    lastSavedContent = block.content;
    currentMetadata = block.metadata || {};
  }

  onMount(() => {
    // Focus empty blocks when they're created
    if (!currentContent && !readOnly) {
      setTimeout(() => {
        const contentEl = document.querySelector(
          `#block-${block.id} [contenteditable]`,
        ) as HTMLElement;
        if (contentEl) contentEl.focus();
      }, 10);
    }

    // Add event listener for real-time updates
    window.addEventListener("block-updated", handleBlockUpdate);
    window.addEventListener("block-operation-applied", handleOperationApplied);
  });

  onDestroy(() => {
    window.removeEventListener("block-updated", handleBlockUpdate);
    window.removeEventListener(
      "block-operation-applied",
      handleOperationApplied,
    );
  });

  function handleBlockUpdate(event: CustomEvent) {
    const updatedBlock = event.detail;
    if (updatedBlock.id === block.id) {
      // Only update if it's not from our own edits
      if (updatedBlock.updatedBy !== block.updatedBy) {
        block = updatedBlock;
        currentContent = updatedBlock.content;
        lastSavedContent = updatedBlock.content;
        currentMetadata = JSON.parse(updatedBlock.metadata || "{}");
      }
    }
  }

  function handleOperationApplied(event: CustomEvent) {
    const { operation, block: updatedBlock } = event.detail;
    if (updatedBlock.id === block.id) {
      // Only apply if it's not our own operation
      if (!isEditing) {
        block = updatedBlock;
        currentContent = updatedBlock.content;
        lastSavedContent = updatedBlock.content;
      }
    }
  }

  afterUpdate(() => {
    // Restore cursor position after component updates
    if (isEditing && contentElement) {
      restoreSelection();
    }
  });

  function startEditing() {
    if (readOnly) return;
    isEditing = true;
  }

  function stopEditing() {
    isEditing = false;
    if (currentContent !== lastSavedContent) {
      dispatch("update", { content: currentContent });
      lastSavedContent = currentContent;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (readOnly) return;

    // Save selection position
    saveSelection();

    // Handle key combinations
    if (event.key === "b" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      formatText("bold");
      return;
    }

    if (event.key === "i" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      formatText("italic");
      return;
    }

    // Enter to create new block (unless Shift is pressed)
    if (event.key === "Enter" && !event.shiftKey) {
      if (block.type !== "code") {
        event.preventDefault();

        const position = getCaretPosition(event.target as HTMLElement);

        dispatch("split", {
          position,
          content: currentContent,
        });
        return;
      }
    }

    // Delete/Backspace at start of block merges with previous
    if (
      event.key === "Backspace" &&
      getCaretPosition(event.target as HTMLElement) === 0
    ) {
      if (block.position > 0) {
        event.preventDefault();
        dispatch("merge", { direction: "backward" });
        return;
      }
    }

    // Tab for indentation in code blocks or list items
    if (event.key === "Tab") {
      if (block.type === "code" || block.type === "list") {
        event.preventDefault();
        const position = getCaretPosition(event.target as HTMLElement);

        if (event.shiftKey) {
          // Unindent
          if (block.type === "list" && currentMetadata?.indent > 0) {
            updateMetadata({ indent: Math.max(0, currentMetadata.indent - 1) });
          } else if (
            currentContent.startsWith("\t") ||
            currentContent.startsWith("  ")
          ) {
            // Remove tab or two spaces
            const newContent = currentContent.startsWith("\t")
              ? currentContent.substring(1)
              : currentContent.substring(2);

            currentContent = newContent;

            queueLocalOperation(block.id, {
              type: "delete",
              position: 0,
              length: currentContent.startsWith("\t") ? 1 : 2,
            });

            dispatch("update", { content: currentContent });
            lastSavedContent = currentContent;
          }
        } else {
          // Indent
          if (block.type === "list") {
            updateMetadata({ indent: (currentMetadata?.indent || 0) + 1 });
          } else {
            // Insert tab or two spaces
            const indentChar = block.type === "code" ? "\t" : "  ";
            currentContent = indentChar + currentContent;

            queueLocalOperation(block.id, {
              type: "insert",
              position: 0,
              value: indentChar,
            });

            // dispatch("update", { content: currentContent });
            // lastSavedContent = currentContent;

            // Update caret position
            setTimeout(() => {
              setCaretPosition(contentElement, position + indentChar.length);
            }, 0);
          }
        }
        return;
      }
    }

    // Alt+ArrowUp/Down to move blocks
    if (
      (event.key === "ArrowUp" || event.key === "ArrowDown") &&
      event.altKey
    ) {
      event.preventDefault();
      dispatch("move", { direction: event.key === "ArrowUp" ? "up" : "down" });
      return;
    }

    // Catch-all for regular typing operations
    // Actual operations will be created in the handleInput function
  }

  function handleInput(event: Event) {
    const target = event.target as HTMLElement;
    const newContent = target.innerText || "";

    // Save selection position
    saveSelection();

    // Detect what changed
    if (newContent.length > currentContent.length) {
      // Text was added
      if (newContent.startsWith(currentContent)) {
        // Addition at the end
        const addedText = newContent.substring(currentContent.length);
        const position = currentContent.length;

        queueLocalOperation(block.id, {
          type: "insert",
          position,
          value: addedText,
        });
      } else {
        // Addition somewhere else
        const position = findDifferencePosition(currentContent, newContent);
        const addedLength = newContent.length - currentContent.length;
        const addedText = newContent.substring(
          position,
          position + addedLength,
        );

        queueLocalOperation(block.id, {
          type: "insert",
          position,
          value: addedText,
        });
      }
    } else if (newContent.length < currentContent.length) {
      // Text was removed
      const position = findDifferencePosition(currentContent, newContent);
      const length = currentContent.length - newContent.length;

      queueLocalOperation(block.id, {
        type: "delete",
        position,
        length,
      });
    }

    currentContent = newContent;

    // Mark as dirty if needed
    // if (currentContent !== lastSavedContent) {
    //   // Debounce updates
    //   clearTimeout(updateTimeout);
    //   updateTimeout = setTimeout(() => {
    //     dispatch("update", { content: currentContent });
    //     lastSavedContent = currentContent;
    //   }, 1000);
    // }
  }

  function handleBlur() {
    stopEditing();
    clearTimeout(updateTimeout);

    if (currentContent !== lastSavedContent) {
      dispatch("update", { content: currentContent });
      lastSavedContent = currentContent;
    }
  }

  function saveSelection() {
    if (contentElement) {
      selectionPosition = getCaretPosition(contentElement);
    }
  }

  function restoreSelection() {
    if (contentElement && isEditing) {
      setCaretPosition(contentElement, selectionPosition);
    }
  }

  function getCaretPosition(element: HTMLElement): number {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return 0;

    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
  }

  function setCaretPosition(element: HTMLElement, position: number) {
    // Find the text node and offset
    let currentNode: Node | null = element.firstChild;
    let offset = 0;

    if (!currentNode) {
      // Empty node, create a text node
      currentNode = document.createTextNode("");
      element.appendChild(currentNode);
    }

    // Navigate to the right node
    while (currentNode) {
      if (currentNode.nodeType === Node.TEXT_NODE) {
        const nodeLength = currentNode.textContent?.length || 0;
        if (offset + nodeLength >= position) {
          const range = document.createRange();
          const selection = window.getSelection();

          range.setStart(currentNode, position - offset);
          range.collapse(true);

          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
          return;
        }
        offset += nodeLength;
      }

      if (currentNode.nextSibling) {
        currentNode = currentNode.nextSibling;
      } else if (currentNode.firstChild) {
        currentNode = currentNode.firstChild;
      } else {
        // No more nodes to check
        break;
      }
    }

    // If we got here, we couldn't set the caret at the exact position
    // so we'll set it at the end
    const range = document.createRange();
    const selection = window.getSelection();

    range.selectNodeContents(element);
    range.collapse(false);

    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function handleDelete() {
    if (readOnly) return;
    if (confirm("Delete this block?")) {
      dispatch("delete");
    }
  }

  function changeBlockType(newType: string) {
    if (readOnly) return;
    dispatch("update", { type: newType });
  }

  function updateMetadata(updates: any) {
    if (readOnly) return;
    const newMetadata = { ...currentMetadata, ...updates };
    currentMetadata = newMetadata;
    dispatch("update", { metadata: newMetadata });
  }

  function formatText(format: string) {
    if (readOnly || !contentElement) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const selectedText = range.toString();

    if (selectedText.length === 0) return;

    const startPosition =
      getCaretPosition(contentElement) - selectedText.length;
    const endPosition = getCaretPosition(contentElement);

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
      case "link":
        replacement = `[${selectedText}](url)`;
        break;
      default:
        return;
    }

    // Delete the selected text
    const beforeText = currentContent.substring(0, startPosition);
    const afterText = currentContent.substring(endPosition);

    // Queue delete operation
    queueLocalOperation(block.id, {
      type: "delete",
      position: startPosition,
      length: selectedText.length,
    });

    // Insert the formatted text
    const newContent = beforeText + replacement + afterText;

    // Queue insert operation
    queueLocalOperation(block.id, {
      type: "insert",
      position: startPosition,
      value: replacement,
    });

    currentContent = newContent;
    dispatch("update", { content: newContent });
    lastSavedContent = newContent;

    // Set the cursor after the formatted text
    setTimeout(() => {
      setCaretPosition(contentElement, startPosition + replacement.length);
    }, 0);
  }

  // Helper to find where two strings differ
  function findDifferencePosition(str1: string, str2: string): number {
    const minLength = Math.min(str1.length, str2.length);

    for (let i = 0; i < minLength; i++) {
      if (str1[i] !== str2[i]) {
        return i;
      }
    }

    return minLength;
  }

  // Functions to help with handling image blocks
  async function handleImageUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];

    try {
      // You'd typically upload this to a server or convert to data URL
      // For this example, we'll just use a data URL
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;

        updateMetadata({
          src: dataUrl,
          alt: file.name,
          width: 100,
          mimeType: file.type,
        });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Failed to upload image:", error);
    }
  }

  function openBlockMenu() {
    // Show a menu with block type options
    const menu = [
      { id: "paragraph", name: "Paragraph" },
      {
        id: "heading",
        name: "Heading",
        submenu: [
          { id: "heading-1", name: "Heading 1" },
          { id: "heading-2", name: "Heading 2" },
          { id: "heading-3", name: "Heading 3" },
        ],
      },
      {
        id: "list",
        name: "List",
        submenu: [
          { id: "list-unordered", name: "Bullet List" },
          { id: "list-ordered", name: "Numbered List" },
        ],
      },
      { id: "code", name: "Code Block" },
      { id: "image", name: "Image" },
      { id: "divider", name: "Divider" },
    ];

    // Show menu and handle selection
    // This is just a placeholder - you'd implement a proper menu component
    const selected = prompt(
      "Choose block type: paragraph, heading, list, code, image, divider",
    );

    if (selected) {
      switch (selected) {
        case "heading":
          changeBlockType("heading");
          updateMetadata({ level: 2 });
          break;
        case "list":
          changeBlockType("list");
          updateMetadata({ ordered: false, indent: 0 });
          break;
        default:
          changeBlockType(selected);
          break;
      }
    }
  }
</script>

<div class={blockClass} id={`block-${block.id}`}>
  <div class="block-meta">
    {#if !readOnly}
      <div class="block-controls">
        <button
          class="type-btn"
          title="Change block type"
          on:click={openBlockMenu}
        >
          {block.type}
        </button>
        <button class="delete-btn" on:click={handleDelete} title="Delete block">
          x
        </button>
      </div>
    {/if}

    <CollaborationIndicator blockId={block.id} />
  </div>

  <div class="block-content">
    {#if block.type === "paragraph"}
      <p
        bind:this={contentElement}
        contenteditable={readOnly ? "false" : "true"}
        on:focus={startEditing}
        on:blur={handleBlur}
        on:keydown={handleKeydown}
        on:input={handleInput}
      >
        {currentContent}
      </p>
    {:else if block.type === "heading"}
      {#if block.metadata?.level === 1}
        <h1
          bind:this={contentElement}
          contenteditable={!readOnly}
          on:focus={startEditing}
          on:blur={handleBlur}
          on:keydown={handleKeydown}
          on:input={handleInput}
        >
          {currentContent}
        </h1>
      {:else if block.metadata?.level === 2}
        <h2
          bind:this={contentElement}
          contenteditable={!readOnly}
          on:focus={startEditing}
          on:blur={handleBlur}
          on:keydown={handleKeydown}
          on:input={handleInput}
        >
          {currentContent}
        </h2>
      {:else}
        <h3
          bind:this={contentElement}
          contenteditable={!readOnly}
          on:focus={startEditing}
          on:blur={handleBlur}
          on:keydown={handleKeydown}
          on:input={handleInput}
        >
          {currentContent}
        </h3>
      {/if}

      {#if isEditing}
        <div class="heading-controls">
          <button on:click={() => updateMetadata({ level: 1 })}>H1</button>
          <button on:click={() => updateMetadata({ level: 2 })}>H2</button>
          <button on:click={() => updateMetadata({ level: 3 })}>H3</button>
        </div>
      {/if}
    {:else if block.type === "list"}
      <div
        class="list-item"
        style={`margin-left: ${(block.metadata?.indent || 0) * 20}px`}
      >
        {#if block.metadata?.ordered}
          <span class="list-marker">{block.position + 1}.</span>
        {:else}
          <span class="list-marker">-</span>
        {/if}
        <div
          bind:this={contentElement}
          contenteditable={!readOnly}
          on:focus={startEditing}
          on:blur={handleBlur}
          on:keydown={handleKeydown}
          on:input={handleInput}
          class="list-content"
        >
          {currentContent}
        </div>
      </div>

      {#if isEditing}
        <div class="list-controls">
          <button
            on:click={() =>
              updateMetadata({ ordered: !block.metadata?.ordered })}
          >
            {block.metadata?.ordered ? "Bullet" : "Numbered"}
          </button>
          <button
            on:click={() =>
              updateMetadata({
                indent: Math.max(0, (block.metadata?.indent || 0) - 1),
              })}
            disabled={(block.metadata?.indent || 0) === 0}
          >
            &lt-
          </button>
          <button
            on:click={() =>
              updateMetadata({ indent: (block.metadata?.indent || 0) + 1 })}
          >
            -&gt
          </button>
        </div>
      {/if}
    {:else if block.type === "code"}
      <pre class="code-block">
        <code
          bind:this={contentElement}
          contenteditable={!readOnly}
          on:focus={startEditing}
          on:blur={handleBlur}
          on:keydown={handleKeydown}
          on:input={handleInput}>
          {currentContent}</code
        >
      </pre>

      {#if isEditing}
        <div class="code-controls">
          <select
            value={block.metadata?.language || ""}
            on:change={(e) => updateMetadata({ language: e.target.value })}
          >
            <option value="">Plain</option>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="html">HTML</option>
            <option value="css">CSS</option>
            <option value="typescript">TypeScript</option>
            <option value="json">JSON</option>
            <option value="markdown">Markdown</option>
            <option value="bash">Bash</option>
            <option value="sql">SQL</option>
          </select>
        </div>
      {/if}
    {:else if block.type === "image"}
      <div class="image-block">
        {#if block.metadata?.src}
          <img
            src={block.metadata.src}
            alt={block.metadata.alt || ""}
            style={`max-width: ${block.metadata.width || 100}%`}
          />
        {:else}
          <div class="image-placeholder">
            <input
              type="file"
              accept="image/*"
              on:change={handleImageUpload}
              disabled={readOnly}
              id={`image-upload-${block.id}`}
              style="display: none;"
            />
            <label for={`image-upload-${block.id}`} class="upload-btn">
              Upload Image
            </label>
          </div>
        {/if}

        {#if isEditing && block.metadata?.src}
          <div class="image-controls">
            <input
              type="text"
              placeholder="Alt text"
              value={block.metadata.alt || ""}
              on:change={(e) => updateMetadata({ alt: e.target.value })}
            />
            <div class="width-control">
              <span>Width: {block.metadata.width || 100}%</span>
              <input
                type="range"
                min="10"
                max="100"
                value={block.metadata.width || 100}
                on:input={(e) =>
                  updateMetadata({ width: parseInt(e.target.value) })}
              />
            </div>
            <button on:click={() => updateMetadata({ src: null })}>
              Remove Image
            </button>
          </div>
        {/if}
      </div>
    {:else if block.type === "divider"}
      <hr />
      {#if isEditing}
        <div class="divider-placeholder" contenteditable={false}>Divider</div>
      {/if}
    {:else}
      <!-- Fallback for unknown block types -->
      <div
        bind:this={contentElement}
        contenteditable={!readOnly}
        on:focus={startEditing}
        on:blur={handleBlur}
        on:keydown={handleKeydown}
        on:input={handleInput}
      >
        {currentContent}
      </div>
    {/if}
  </div>

  {#if isEditing && block.type !== "image" && block.type !== "divider"}
    <div class="formatting-toolbar">
      <button on:click={() => formatText("bold")} title="Bold (Ctrl+B)"
        >B</button
      >
      <button on:click={() => formatText("italic")} title="Italic (Ctrl+I)"
        >I</button
      >
      <button on:click={() => formatText("code")} title="Code">Code</button>
      <button on:click={() => formatText("link")} title="Link">Link</button>
    </div>
  {/if}
</div>

<style>
  .block {
    position: relative;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    margin-bottom: 0.5rem;
  }

  .block:hover {
    background-color: #f8f9fa;
  }

  .block.editing {
    background-color: #f0f7ff;
  }

  .block-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.25rem;
  }

  .block-controls {
    position: absolute;
    left: -40px;
    top: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .block:hover .block-controls {
    opacity: 1;
  }

  .type-btn,
  .delete-btn {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    border: 1px solid #ddd;
    background: white;
    font-size: 0.7rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .type-btn:hover,
  .delete-btn:hover {
    background-color: #f0f0f0;
  }

  .delete-btn {
    color: #dc3545;
  }

  .block-content {
    min-height: 1.5rem;
  }

  .block-content p,
  .block-content h1,
  .block-content h2,
  .block-content h3,
  .block-content [contenteditable] {
    margin: 0;
    outline: none;
    min-height: 1.5rem;
  }

  .block-content h1 {
    font-size: 1.8rem;
    font-weight: 600;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .block-content h2 {
    font-size: 1.5rem;
    font-weight: 600;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .block-content h3 {
    font-size: 1.2rem;
    font-weight: 600;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .heading-controls,
  .list-controls,
  .code-controls,
  .image-controls {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.25rem;
    padding: 0.25rem;
    background: #f0f0f0;
    border-radius: 4px;
    font-size: 0.8rem;
  }

  .heading-controls button,
  .list-controls button,
  .code-controls button {
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .heading-controls button:hover,
  .list-controls button:hover,
  .code-controls button:hover {
    background-color: #e9ecef;
  }

  .list-item {
    display: flex;
    align-items: flex-start;
  }

  .list-marker {
    margin-right: 0.5rem;
    user-select: none;
    flex-shrink: 0;
  }

  .list-content {
    flex-grow: 1;
    min-height: 1.5rem;
  }

  .code-block {
    background: #f5f5f5;
    padding: 0.75rem;
    border-radius: 4px;
    margin: 0;
    overflow: auto;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  }

  .code-block code {
    font-family: inherit;
    outline: none;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .image-block {
    text-align: center;
  }

  .image-placeholder {
    border: 2px dashed #ddd;
    padding: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .upload-btn {
    background: #4a90e2;
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .upload-btn:hover {
    background: #357abd;
  }

  .image-controls {
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
  }

  .image-controls input[type="text"] {
    width: 100%;
    padding: 0.25rem 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
  }

  .width-control {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .width-control span {
    font-size: 0.8rem;
    margin-bottom: 0.25rem;
  }

  .divider-placeholder {
    color: #aaa;
    text-align: center;
    font-size: 0.8rem;
    user-select: none;
  }

  .formatting-toolbar {
    position: absolute;
    bottom: -30px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 0.25rem;
    background: white;
    padding: 0.25rem;
    border-radius: 4px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    z-index: 10;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .block.editing .formatting-toolbar {
    opacity: 1;
  }

  .formatting-toolbar button {
    width: 30px;
    height: 24px;
    border-radius: 4px;
    border: 1px solid #ddd;
    background: white;
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .formatting-toolbar button:hover {
    background-color: #f0f0f0;
  }

  hr {
    border: none;
    border-top: 2px solid #eee;
    margin: 1rem 0;
  }
</style>

