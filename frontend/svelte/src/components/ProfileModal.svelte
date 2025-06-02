<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { profile, storeActions } from "../lib/stores";

  const dispatch = createEventDispatcher();

  let displayName = $profile?.displayName || "";
  let email = $profile?.email || "";
  let isLoading = false;

  async function saveProfile() {
    if (!displayName.trim()) return;

    isLoading = true;
    try {
      await storeActions.updateProfile({
        displayName: displayName.trim(),
        email: email.trim() || undefined,
      });
      dispatch("close");
    } catch (error) {
      console.error("Failed to update profile:", error);
      alert("Failed to update profile");
    } finally {
      isLoading = false;
    }
  }

  function handleKeydown(event: any) {
    if (event.key === "Escape") {
      dispatch("close");
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />
<div class="modal-backdrop" on:click={() => dispatch("close")}>
  <div class="modal" on:click|stopPropagation on:keydown|stopPropagation>
    <div class="modal-header">
      <h2>Profile Settings</h2>
      <button class="close-btn" on:click={() => dispatch("close")}>x</button>
    </div>

    <form on:submit|preventDefault={saveProfile}>
      <div class="form-group">
        <label for="displayName">Display Name</label>
        <input
          id="displayName"
          type="text"
          bind:value={displayName}
          placeholder="Your name"
          required
        />
      </div>

      <div class="form-group">
        <label for="email">Email (optional)</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          placeholder="your@email.com"
        />
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
          disabled={!displayName.trim() || isLoading}
        >
          {isLoading ? "Saving..." : "Save"}
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
