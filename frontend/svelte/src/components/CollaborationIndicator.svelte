<script lang="ts" context="module">
  // Generate consistent colors for peer IDs
  function getColorForPeerId(peerId: string): string {
    const colors = [
      "#4a90e2",
      "#50e3c2",
      "#e74c3c",
      "#f39c12",
      "#8e44ad",
      "#27ae60",
      "#d35400",
      "#16a085",
    ];

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < peerId.length; i++) {
      hash = (hash << 5) - hash + peerId.charCodeAt(i);
      hash |= 0;
    }

    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }
</script>

<!-- frontend/svelte/src/components/CollaborationIndicator.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    blockEditors,
    blockPendingOps,
    startEditingBlock,
    stopEditingBlock,
  } from "../lib/blockSync";

  export let blockId: string;

  let localPeerId = `local-${Math.random().toString(36).substring(2, 10)}`;
  let editors: string[] = [];
  let pendingOps = 0;

  // Subscribe to editors for this block
  $: {
    editors = $blockEditors.get(blockId) || [];
    pendingOps = $blockPendingOps.get(blockId) || 0;
  }

  onMount(async () => {
    await startEditingBlock(blockId, localPeerId);
  });

  onDestroy(async () => {
    await stopEditingBlock(blockId, localPeerId);
  });
</script>

<div class="collab-indicator">
  {#if editors.length > 1}
    <div class="editors" title="People editing this block">
      {#each editors.filter((id) => id !== localPeerId) as editor}
        <div
          class="editor-avatar"
          style="background-color: {getColorForPeerId(editor)}"
        >
          {editor.charAt(0).toUpperCase()}
        </div>
      {/each}
    </div>
  {/if}

  {#if pendingOps > 0}
    <div class="pending-ops" title="Pending operations">
      <div class="spinner"></div>
      <span>{pendingOps}</span>
    </div>
  {/if}
</div>

<style>
  .collab-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .editors {
    display: flex;
    align-items: center;
  }

  .editor-avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    color: white;
    font-size: 0.7rem;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: -5px;
  }

  .pending-ops {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.7rem;
    color: #666;
  }

  .spinner {
    width: 12px;
    height: 12px;
    border: 1.5px solid rgba(0, 0, 0, 0.1);
    border-radius: 50%;
    border-top-color: #666;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
