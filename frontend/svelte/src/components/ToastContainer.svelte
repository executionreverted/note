<script lang="ts">
  import { toasts } from "../lib/stores";
  import ToastNotification from "./ToastNotification.svelte";

  function removeToast(id: string) {
    toasts.update((items) => items.filter((item) => item.id !== id));
  }
</script>

<div class="toast-container">
  {#each $toasts as toast (toast.id)}
    <div on:click={() => removeToast(toast.id)}>
      <ToastNotification
        message={toast.message}
        type={toast.type}
        duration={4000}
      />
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    pointer-events: none;
  }

  .toast-container > div {
    pointer-events: auto;
  }
</style>
