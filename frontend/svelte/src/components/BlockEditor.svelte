<!-- frontend/svelte/src/components/BlockEditor.svelte -->
<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import { storeActions } from "../lib/stores";
  import BlockComponent from "./BlockComponent.svelte";
  import AddBlockButton from "./AddBlockButton.svelte";
  import type { Block } from "../lib/types";

  export let pageId: string;
  export let readOnly: boolean = false;

  const dispatch = createEventDispatcher();

  let blocks: Block[] = [];
  let isLoading = true;
  let draggedBlockId: string | null = null;
  let dragOverPosition: number | null = null;

  onMount(async () => {
    await loadBlocks();
  });

  async function loadBlocks() {
    isLoading = true;
    try {
      blocks = await storeActions.getBlocksByPage(pageId);
    } catch (error) {
      console.error("Failed to load blocks:", error);
    } finally {
      isLoading = false;
    }
  }

  async function handleAddBlock(type: string, position: number) {
    try {
      const newBlock = await storeActions.createBlock(pageId, type, "", {
        position,
      });

      // Insert block at position
      blocks = [
        ...blocks.slice(0, position),
        newBlock,
        ...blocks.slice(position),
      ];

      // Update positions of subsequent blocks
      for (let i = position + 1; i < blocks.length; i++) {
        await storeActions.updateBlock(blocks[i].id, { position: i });
        blocks[i].position = i;
      }

      // Focus the new block
      setTimeout(() => {
        const blockEl = document.getElementById(`block-${newBlock.id}`);
        if (blockEl) {
          const contentEl = blockEl.querySelector("[contenteditable]");
          if (contentEl) contentEl.focus();
        }
      }, 10);
    } catch (error) {
      console.error("Failed to add block:", error);
    }
  }

  async function handleUpdateBlock(id: string, updates: any) {
    try {
      const updatedBlock = await storeActions.updateBlock(id, updates);
      blocks = blocks.map((block) => (block.id === id ? updatedBlock : block));
    } catch (error) {
      console.error("Failed to update block:", error);
    }
  }

  async function handleDeleteBlock(id: string) {
    try {
      await storeActions.deleteBlock(id);
      const index = blocks.findIndex((block) => block.id === id);
      blocks = blocks.filter((block) => block.id !== id);

      // Update positions of subsequent blocks
      for (let i = index; i < blocks.length; i++) {
        await storeActions.updateBlock(blocks[i].id, { position: i });
        blocks[i].position = i;
      }
    } catch (error) {
      console.error("Failed to delete block:", error);
    }
  }

  async function handleDragStart(e: DragEvent, id: string) {
    if (readOnly) return;

    draggedBlockId = id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    }
  }

  async function handleDragOver(e: DragEvent, position: number) {
    if (readOnly || !draggedBlockId) return;

    e.preventDefault();
    dragOverPosition = position;
  }

  async function handleDrop(e: DragEvent, targetPosition: number) {
    if (readOnly || !draggedBlockId) return;

    e.preventDefault();

    const sourceIndex = blocks.findIndex(
      (block) => block.id === draggedBlockId,
    );
    if (sourceIndex === -1) return;

    // Adjust target position if dropping after source
    let newPosition = targetPosition;
    if (sourceIndex < targetPosition) {
      newPosition--;
    }

    // Move the block
    const movedBlock = await storeActions.moveBlock(
      draggedBlockId,
      newPosition,
    );

    // Rearrange blocks
    const blocksCopy = [...blocks];
    const [removed] = blocksCopy.splice(sourceIndex, 1);
    blocksCopy.splice(newPosition, 0, removed);

    // Update positions
    for (let i = 0; i < blocksCopy.length; i++) {
      blocksCopy[i].position = i;
      if (blocksCopy[i].id !== draggedBlockId) {
        await storeActions.updateBlock(blocksCopy[i].id, { position: i });
      }
    }

    blocks = blocksCopy;
    draggedBlockId = null;
    dragOverPosition = null;
  }

  async function handleSplitBlock(
    blockId: string,
    position: number,
    content: string,
  ) {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;

    const blockIndex = blocks.findIndex((b) => b.id === blockId);

    // Update the original block with content before cursor
    const beforeText = content.substring(0, position);
    await handleUpdateBlock(blockId, { content: beforeText });

    // Create a new block with content after cursor
    const afterText = content.substring(position);
    await handleAddBlock(block.type, blockIndex + 1);

    const newBlockId = blocks[blockIndex + 1].id;
    await handleUpdateBlock(newBlockId, { content: afterText });
  }

  async function handleBlockOperation(blockId: string, operation: any) {
    try {
      const result = await storeActions.applyBlockOperation(blockId, operation);
      const updatedBlock = result.block;

      blocks = blocks.map((block) =>
        block.id === blockId ? updatedBlock : block,
      );
    } catch (error) {
      console.error("Failed to apply operation:", error);
    }
  }
</script>

<div class="block-editor">
  {#if isLoading}
    <div class="loading">Loading blocks...</div>
  {:else if blocks.length === 0}
    <div class="empty-state">
      <p>This page is empty. Add your first block!</p>
      <button
        class="btn-primary"
        on:click={() => handleAddBlock("paragraph", 0)}
      >
        Add Paragraph
      </button>
    </div>
  {:else}
    <div class="blocks-container">
      {#each blocks as block, index (block.id)}
        <div
          id={`block-${block.id}`}
          class="block-wrapper"
          class:dragging={block.id === draggedBlockId}
          class:drag-over={dragOverPosition === index}
          draggable={!readOnly}
          on:dragstart={(e) => handleDragStart(e, block.id)}
          on:dragover={(e) => handleDragOver(e, index)}
          on:drop={(e) => handleDrop(e, index)}
        >
          <BlockComponent
            {block}
            {readOnly}
            on:update={(e) => handleUpdateBlock(block.id, e.detail)}
            on:delete={() => handleDeleteBlock(block.id)}
            on:split={(e) =>
              handleSplitBlock(block.id, e.detail.position, e.detail.content)}
            on:operation={(e) => handleBlockOperation(block.id, e.detail)}
          />

          {#if !readOnly}
            <div class="add-block-wrapper">
              <AddBlockButton
                on:add={(e) => handleAddBlock(e.detail, index + 1)}
              />
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .block-editor {
    width: 100%;
    padding: 1rem;
  }

  .loading {
    padding: 2rem;
    text-align: center;
    color: #666;
  }

  .empty-state {
    padding: 3rem;
    text-align: center;
    color: #666;
  }

  .blocks-container {
    max-width: 800px;
    margin: 0 auto;
  }

  .block-wrapper {
    position: relative;
    margin-bottom: 0.25rem;
    border-radius: 4px;
  }

  .block-wrapper:hover {
    background-color: #f8f9fa;
  }

  .block-wrapper.dragging {
    opacity: 0.5;
  }

  .block-wrapper.drag-over::before {
    content: "";
    position: absolute;
    top: -2px;
    left: 0;
    right: 0;
    height: 2px;
    background-color: #4a90e2;
  }

  .add-block-wrapper {
    position: absolute;
    left: -30px;
    top: 50%;
    transform: translateY(-50%);
    opacity: 0;
    transition: opacity 0.2s;
  }

  .block-wrapper:hover .add-block-wrapper {
    opacity: 1;
  }
</style>
