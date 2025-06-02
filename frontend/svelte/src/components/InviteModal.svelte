<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { ipc } from "../lib/ipc";

  const dispatch = createEventDispatcher();

  let inviteCode = "";
  let isLoading = false;
  let copied = false;

  async function generateInvite() {
    isLoading = true;
    try {
      inviteCode = await ipc.createInvite();
    } catch (error) {
      console.error("Failed to generate invite:", error);
      alert("Failed to generate invite");
    } finally {
      isLoading = false;
    }
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  }

  async function deleteInvite() {
    if (
      confirm(
        "Delete the current invite code? This will revoke access for anyone who hasn't used it yet.",
      )
    ) {
      try {
        await ipc.deleteInvite();
        inviteCode = "";
      } catch (error) {
        console.error("Failed to delete invite:", error);
        alert("Failed to delete invite");
      }
    }
  }

  function handleKeydown(event: any) {
    if (event.key === "Escape") {
      dispatch("close");
    }
  }

  // Generate invite on mount
  generateInvite();
</script>

<svelte:window on:keydown={handleKeydown} />

<div
  class="modal-backdrop"
  on:keydown|stopPropagation
  on:click={() => dispatch("close")}
>
  <div class="modal" on:click|stopPropagation on:keydown|stopPropagation>
    <div class="modal-header">
      <h2>Share Vault</h2>
      <button class="close-btn" on:click={() => dispatch("close")}>x</button>
    </div>

    <div class="modal-content">
      <p>
        Share this invite code with others to give them access to your vault:
      </p>

      {#if isLoading}
        <div class="loading">
          <div class="spinner"></div>
          <span>Generating invite...</span>
        </div>
      {:else if inviteCode}
        <div class="invite-section">
          <div class="invite-code">
            <input type="text" value={inviteCode} readonly />
            <button class="copy-btn" on:click={copyToClipboard}>
              {copied ? "Y" : "N"}
            </button>
          </div>

          <div class="invite-actions">
            <button class="btn-secondary" on:click={generateInvite}>
              Generate New
            </button>
            <button class="btn-danger" on:click={deleteInvite}>
              Delete Invite
            </button>
          </div>
        </div>

        <div class="invite-info">
          <h4>How to use:</h4>
          <ol>
            <li>Copy the invite code above</li>
            <li>Share it with the person you want to collaborate with</li>
            <li>They can use it to connect their Autonote app to your vault</li>
            <li>Once connected, you'll both be able to edit notes together</li>
          </ol>

          <div class="warning">
            <strong>! Security Note:</strong> Anyone with this invite code can access
            your vault. Only share it with trusted people.
          </div>
        </div>
      {:else}
        <div class="error">
          Failed to generate invite code. Please try again.
        </div>
      {/if}
    </div>

    <div class="modal-actions">
      <button class="btn-primary" on:click={() => dispatch("close")}>
        Done
      </button>
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

  .loading {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 2rem;
    text-align: center;
    justify-content: center;
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

  .invite-section {
    margin: 1.5rem 0;
  }

  .invite-code {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .invite-code input {
    flex: 1;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.9rem;
    background: #f8f9fa;
  }

  .copy-btn {
    padding: 0.75rem 1rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: white;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .copy-btn:hover {
    background: #f0f0f0;
  }

  .invite-actions {
    display: flex;
    gap: 0.5rem;
  }

  .invite-info {
    background: #f8f9fa;
    padding: 1rem;
    border-radius: 6px;
    margin-top: 1.5rem;
  }

  .invite-info h4 {
    margin: 0 0 0.5rem 0;
    color: #333;
  }

  .invite-info ol {
    margin: 0.5rem 0;
    padding-left: 1.2rem;
  }

  .invite-info li {
    margin-bottom: 0.25rem;
    font-size: 0.9rem;
  }

  .warning {
    background: #fff3cd;
    border: 1px solid #ffeaa7;
    padding: 0.75rem;
    border-radius: 4px;
    margin-top: 1rem;
    font-size: 0.85rem;
  }

  .error {
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    padding: 1rem;
    border-radius: 4px;
    color: #721c24;
    text-align: center;
  }

  .modal-actions {
    padding: 0 1.5rem 1.5rem 1.5rem;
    text-align: right;
  }

  .btn-primary,
  .btn-secondary,
  .btn-danger {
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

  .btn-primary:hover {
    background-color: #357abd;
  }

  .btn-secondary {
    background-color: #f8f9fa;
    color: #333;
    border: 1px solid #dee2e6;
  }

  .btn-secondary:hover {
    background-color: #e9ecef;
  }

  .btn-danger {
    background-color: #dc3545;
    color: white;
  }

  .btn-danger:hover {
    background-color: #c82333;
  }
</style>
