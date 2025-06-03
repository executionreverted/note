<!-- frontend/svelte/src/components/AddBlockButton.svelte -->
<script lang="ts">
  import { createEventDispatcher } from "svelte";

  const dispatch = createEventDispatcher();

  let isMenuOpen = false;

  const blockTypes = [
    { id: "paragraph", name: "Paragraph", icon: "*" },
    { id: "heading", name: "Heading", icon: "H" },
    { id: "list", name: "List", icon: "-" },
    { id: "code", name: "Code", icon: "</>" },
    { id: "image", name: "Image", icon: "" },
    { id: "divider", name: "Divider", icon: "|" },
  ];

  function toggleMenu() {
    isMenuOpen = !isMenuOpen;
  }

  function selectBlockType(type: string) {
    dispatch("add", type);
    isMenuOpen = false;
  }

  function handleClickOutside(event: MouseEvent) {
    if (
      isMenuOpen &&
      !event
        .composedPath()
        .includes(document.getElementById("block-menu-container"))
    ) {
      isMenuOpen = false;
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div class="add-block" id="block-menu-container">
  <button class="add-btn" on:click={toggleMenu} title="Add block">+</button>

  {#if isMenuOpen}
    <div class="block-menu">
      {#each blockTypes as blockType}
        <button
          class="block-option"
          on:click={() => selectBlockType(blockType.id)}
        >
          <span class="block-icon">{blockType.icon}</span>
          <span class="block-name">{blockType.name}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .add-block {
    position: relative;
  }

  .add-btn {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1px solid #ddd;
    background: white;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .add-btn:hover {
    background-color: #f0f0f0;
  }

  .block-menu {
    position: absolute;
    left: 30px;
    top: 0;
    width: 150px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    z-index: 10;
  }

  .block-option {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.5rem;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .block-option:hover {
    background-color: #f8f9fa;
  }

  .block-icon {
    display: inline-flex;
    width: 20px;
    height: 20px;
    align-items: center;
    justify-content: center;
    margin-right: 0.5rem;
    font-size: 0.9rem;
  }

  .block-name {
    font-size: 0.9rem;
  }
</style>
