<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { ipc } from "../lib/ipc";

  const dispatch = createEventDispatcher();

  let inviteCode = "";
  let vaultName = "";
  let vaultPath = "";
  let isLoading = false;

  // Simple invite code validation
  function validateInviteCode(code: string): boolean {
    // Basic z32 format validation - should be alphanumeric and specific length
    return /^[a-z0-9]+$/i.test(code.trim()) && code.trim().length > 20;
  }

  async function joinVault() {
    if (!inviteCode.trim() || !vaultName.trim() || !vaultPath.trim()) return;

    isLoading = true;
    try {
      // Create vault first
      const vault = await ipc.createVault(vaultName.trim(), vaultPath.trim());

      // Then accept the invite
      await ipc.acceptInvite(inviteCode.trim(), vault.path);

      dispatch("vaultJoined", vault);
    } catch (error: any) {
      console.error("Failed to join vault:", error);
      alert("Failed to join vault: " + error.message);
    } finally {
      isLoading = false;
    }
  }

  function selectPath() {
    // @ts-ignore
    ipc.invoke("dialog:selectDirectory").then((path: any) => {
      if (path) vaultPath = path;
    });
  }

  function handleKeydown(event: any) {
    if (event.key === "Escape") {
      dispatch("close");
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="modal-backdrop" on:click={() => dispatch("close")}>
  <div class="modal" on:click|stopPropagation>
    <div class="modal-header">
      <h2>Join Vault</h2>
      <button class="close-btn" on:click={() => dispatch("close")}>×</button>
    </div>

    <div class="modal-content">
      <p>Enter an invite code to join someone else's vault:</p>

      <form on:submit|preventDefault={joinVault}>
        <div class="form-group">
          <label for="inviteCode">Invite Code</label>
          <input
            id="inviteCode"
            type="text"
            bind:value={inviteCode}
            placeholder="Paste invite code here..."
            required
          />
        </div>

        <div class="form-group">
          <label for="vaultName">Local Vault Name</label>
          <input
            id="vaultName"
            type="text"
            bind:value={vaultName}
            placeholder="Name for this vault on your device"
            required
          />
        </div>

        <div class="form-group">
          <label for="vaultPath">Storage Location</label>
          <div class="path-input">
            <input
              id="vaultPath"
              type="text"
              bind:value={vaultPath}
              placeholder="/path/to/local/vault"
              required
            />
            <button type="button" class="btn-secondary" on:click={selectPath}>
              Browse
            </button>
          </div>
        </div>

        <div class="info-box">
          <strong>Note:</strong> This will create a local copy of the shared vault.
          You'll be able to sync and collaborate on notes with other vault members.
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
            disabled={!inviteCode.trim() ||
              !vaultName.trim() ||
              !vaultPath.trim() ||
              isLoading}
          >
            {isLoading ? "Joining..." : "Join Vault"}
          </button>
        </div>
      </form>
    </div>
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
    max-width: 500px;
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

  .modal-content {
    padding: 1.5rem;
  }

  .form-group {
    margin-bottom: 1rem;
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

  .path-input {
    display: flex;
    gap: 0.5rem;
  }

  .path-input input {
    flex: 1;
  }

  .info-box {
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    padding: 1rem;
    border-radius: 6px;
    margin: 1.5rem 0;
    font-size: 0.9rem;
    color: #495057;
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
