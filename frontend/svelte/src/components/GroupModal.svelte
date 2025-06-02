<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { storeActions } from "../lib/stores";
  import type { Group } from "../lib/ipc";

  const dispatch = createEventDispatcher();

  export let group: Group | null = null;
  export let parentId: string | null = null;

  let name = group?.name || "";
  let color = group?.color || "#4a90e2";
  let icon = group?.icon || "📁";
  let isLoading = false;

  const iconOptions = [
    "📁",
    "📋",
    "💼",
    "🎯",
    "📚",
    "🏠",
    "⚡",
    "🎨",
    "🔧",
    "📊",
  ];
  const colorOptions = [
    "#4a90e2",
    "#28a745",
    "#ffc107",
    "#dc3545",
    "#6f42c1",
    "#fd7e14",
    "#20c997",
    "#6c757d",
  ];

  async function saveGroup() {
    if (!name.trim()) return;

    isLoading = true;
    try {
      if (group) {
        await storeActions.updateGroup(group.id, {
          name: name.trim(),
          color,
          icon,
        });
      } else {
        await storeActions.createGroup(name.trim(), parentId, { color, icon });
      }
      dispatch("close");
    } catch (error) {
      console.error("Failed to save group:", error);
      alert("Failed to save group");
    } finally {
      isLoading = false;
    }
  }

  function handleKeydown(event) {
    if (event.key === "Escape") {
      dispatch("close");
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="modal-backdrop" on:click={() => dispatch("close")}>
  <div class="modal" on:click|stopPropagation>
    <div class="modal-header">
      <h2>{group ? "Edit Group" : "Create Group"}</h2>
      <button class="close-btn" on:click={() => dispatch("close")}>×</button>
    </div>

    <form on:submit|preventDefault={saveGroup}>
      <div class="form-group">
        <label for="groupName">Group Name</label>
        <input
          id="groupName"
          type="text"
          bind:value={name}
          placeholder="Group name"
          required
        />
      </div>

      <div class="form-group">
        <label>Icon</label>
        <div class="icon-grid">
          {#each iconOptions as iconOption}
            <button
              type="button"
              class="icon-option"
              class:selected={icon === iconOption}
              on:click={() => (icon = iconOption)}
            >
              {iconOption}
            </button>
          {/each}
        </div>
      </div>

      <div class="form-group">
        <label>Color</label>
        <div class="color-grid">
          {#each colorOptions as colorOption}
            <button
              type="button"
              class="color-option"
              class:selected={color === colorOption}
              style="background-color: {colorOption}"
              on:click={() => (color = colorOption)}
            ></button>
          {/each}
        </div>
      </div>

      <div class="modal-actions">
        <button
          type="button"
          class="btn-secondary"
          on:click={() => dispatch("close")}
        >
          Cancel
        </button>
        <button
          type="submit"
          class="btn-primary"
          disabled={!name.trim() || isLoading}
        >
          {isLoading ? "Saving..." : group ? "Update" : "Create"}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
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

  .modal {
    background: white;
    border-radius: 8px;
    width: 90%;
    max-width: 400px;
    max-height: 90vh;
    overflow: auto;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem 1.5rem 0 1.5rem;
  }

  .modal-header h2 {
    margin: 0;
    color: #333;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #666;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background-color 0.2s;
  }

  .close-btn:hover {
    background-color: #f0f0f0;
  }

  form {
    padding: 1.5rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #333;
  }

  .form-group input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
  }

  .form-group input:focus {
    outline: none;
    border-color: #4a90e2;
  }

  .icon-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.5rem;
  }

  .icon-option {
    background: #f8f9fa;
    border: 2px solid #e9ecef;
    border-radius: 6px;
    padding: 0.75rem;
    font-size: 1.2rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .icon-option:hover {
    background: #e9ecef;
  }

  .icon-option.selected {
    border-color: #4a90e2;
    background: #e3f2fd;
  }

  .color-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }

  .color-option {
    width: 40px;
    height: 40px;
    border: 3px solid transparent;
    border-radius: 50%;
    cursor: pointer;
    transition: border-color 0.2s;
  }

  .color-option.selected {
    border-color: #333;
  }

  .modal-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    margin-top: 2rem;
  }

  .btn-primary,
  .btn-secondary {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .btn-primary {
    background-color: #4a90e2;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background-color: #357abd;
  }

  .btn-primary:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }

  .btn-secondary {
    background-color: #f8f9fa;
    color: #333;
    border: 1px solid #dee2e6;
  }

  .btn-secondary:hover {
    background-color: #e9ecef;
  }
</style>
