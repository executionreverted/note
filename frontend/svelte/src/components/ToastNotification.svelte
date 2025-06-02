<script lang="ts">
  import { onMount } from "svelte";
  import { writable } from "svelte/store";

  export let message: string = "";
  export let type: "info" | "success" | "warning" | "error" = "info";
  export let duration: number = 3000;

  let visible = false;

  onMount(() => {
    visible = true;

    if (duration > 0) {
      setTimeout(() => {
        visible = false;
      }, duration);
    }
  });
</script>

{#if visible}
  <div class="toast toast-{type}" on:click={() => (visible = false)}>
    <div class="toast-content">
      <div class="toast-icon">
        {#if type === "success"}
          Success
        {:else if type === "warning"}
          Warning
        {:else if type === "error"}
          Error
        {:else}
          !
        {/if}
      </div>
      <span class="toast-message">{message}</span>
    </div>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    top: 1rem;
    right: 1rem;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    cursor: pointer;
    z-index: 9999;
    max-width: 400px;
    animation: slideIn 0.3s ease-out;
    border-left: 4px solid;
  }

  .toast-info {
    border-left-color: #4a90e2;
  }

  .toast-success {
    border-left-color: #28a745;
  }

  .toast-warning {
    border-left-color: #ffc107;
  }

  .toast-error {
    border-left-color: #dc3545;
  }

  .toast-content {
    display: flex;
    align-items: center;
    padding: 0.75rem 1rem;
    gap: 0.5rem;
  }

  .toast-icon {
    font-size: 1rem;
    font-weight: bold;
  }

  .toast-info .toast-icon {
    color: #4a90e2;
  }

  .toast-success .toast-icon {
    color: #28a745;
  }

  .toast-warning .toast-icon {
    color: #ffc107;
  }

  .toast-error .toast-icon {
    color: #dc3545;
  }

  .toast-message {
    font-size: 0.875rem;
    color: #333;
  }

  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .toast:hover {
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  }
</style>
