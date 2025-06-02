<script lang="ts">
  import { onMount } from "svelte";
  import { ipc, type Vault } from "../lib/ipc";
  import { storeActions } from "../lib/stores";

  let vaults: Vault[] = [];
  let isLoading = false;
  let showCreateModal = false;
  let newVaultName = "";
  let newVaultPath = "";

  onMount(async () => {
    vaults = await ipc.listVaults();
  });

  async function openVault(vault: Vault) {
    isLoading = true;
    try {
      await storeActions.openVault(vault);
    } catch (error: any) {
      console.error("Failed to open vault:", error);
      alert("Failed to open vault: " + error.message);
    } finally {
      isLoading = false;
    }
  }

  async function createVault() {
    if (!newVaultName.trim() || !newVaultPath.trim()) return;

    try {
      const vault = await ipc.createVault(
        newVaultName.trim(),
        newVaultPath.trim(),
      );
      vaults = [...vaults, vault];
      showCreateModal = false;
      newVaultName = "";
      newVaultPath = "";
      await openVault(vault);
    } catch (error: any) {
      console.error("Failed to create vault:", error);
      alert("Failed to create vault: " + error.message);
    }
  }

  function selectPath() {
    // This would open a directory dialog - we'll implement in the main process
    // @ts-ignore
    ipc.invoke("dialog:selectDirectory").then((path: any) => {
      if (path) newVaultPath = path;
    });
  }
</script>

<div class="vault-selection">
  <div class="header">
    <h1>Autonote</h1>
    <p>Select a vault to open or create a new one</p>
  </div>

  <div class="vault-list">
    {#each vaults as vault (vault.path)}
      <div
        class="vault-item"
        on:keypress={() => openVault(vault)}
        on:click={() => openVault(vault)}
      >
        <div class="vault-info">
          <h3>{vault.name}</h3>
          <p>{vault.path}</p>
          <small>{new Date(vault.lastAccessed).toLocaleDateString()}</small>
        </div>
        <div class="vault-arrow"></div>
      </div>
    {/each}

    {#if vaults.length === 0}
      <div class="empty-state">
        <p>No vaults found. Create your first vault to get started.</p>
      </div>
    {/if}
  </div>

  <div class="actions">
    <button class="btn-primary" on:click={() => (showCreateModal = true)}>
      Create New Vault
    </button>
  </div>

  {#if isLoading}
    <div class="loading-overlay">
      <div class="spinner"></div>
      <p>Opening vault...</p>
    </div>
  {/if}
</div>

{#if showCreateModal}
  <div
    class="modal-backdrop"
    on:keypress={() => (showCreateModal = false)}
    on:click={() => (showCreateModal = false)}
  >
    <div class="modal" on:click|stopPropagation>
      <h2>Create New Vault</h2>

      <div class="form-group">
        <label for="vaultName">Vault Name</label>
        <input
          id="vaultName"
          type="text"
          bind:value={newVaultName}
          placeholder="My Notes"
          required
        />
      </div>

      <div class="form-group">
        <label for="vaultPath">Storage Location</label>
        <div class="path-input">
          <input
            id="vaultPath"
            type="text"
            bind:value={newVaultPath}
            placeholder="/path/to/vault"
            required
          />
          <button type="button" class="btn-secondary" on:click={selectPath}>
            Browse
          </button>
        </div>
      </div>

      <div class="modal-actions">
        <button
          class="btn-secondary"
          on:click={() => (showCreateModal = false)}
        >
          Cancel
        </button>
        <button
          class="btn-primary"
          on:click={createVault}
          disabled={!newVaultName.trim() || !newVaultPath.trim()}
        >
          Create Vault
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .vault-selection {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    max-width: 600px;
    margin: 0 auto;
    padding: 2rem;
  }

  .header {
    text-align: center;
    margin-bottom: 3rem;
  }

  .header h1 {
    font-size: 2.5rem;
    color: #333;
    margin-bottom: 0.5rem;
  }

  .header p {
    color: #666;
    font-size: 1.1rem;
  }

  .vault-list {
    flex: 1;
    margin-bottom: 2rem;
  }

  .vault-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    margin-bottom: 0.5rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .vault-item:hover {
    background-color: #f5f5f5;
    border-color: #4a90e2;
  }

  .vault-info h3 {
    margin: 0 0 0.25rem 0;
    color: #333;
  }

  .vault-info p {
    margin: 0 0 0.25rem 0;
    color: #666;
    font-size: 0.9rem;
  }

  .vault-info small {
    color: #999;
    font-size: 0.8rem;
  }

  .vault-arrow {
    font-size: 1.5rem;
    color: #ccc;
  }

  .empty-state {
    text-align: center;
    padding: 3rem;
    color: #666;
  }

  .actions {
    text-align: center;
  }

  .btn-primary,
  .btn-secondary {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
    transition: background-color 0.2s ease;
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
    background-color: #f5f5f5;
    color: #333;
    border: 1px solid #ddd;
  }

  .btn-secondary:hover {
    background-color: #e8e8e8;
  }

  .loading-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: white;
    animation: spin 1s ease-in-out infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
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
  }

  .modal {
    background: white;
    padding: 2rem;
    border-radius: 8px;
    width: 90%;
    max-width: 400px;
  }

  .modal h2 {
    margin-top: 0;
    margin-bottom: 1.5rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }

  .form-group input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
  }

  .path-input {
    display: flex;
    gap: 0.5rem;
  }

  .path-input input {
    flex: 1;
  }

  .modal-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    margin-top: 2rem;
  }
</style>
