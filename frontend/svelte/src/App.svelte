<!-- frontend/svelte/src/App.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { isVaultOpen } from "./lib/stores";
  import VaultSelection from "./components/VaultSelection.svelte";
  import MainLayout from "./components/MainLayout.svelte";

  // Global styles and app initialization
  onMount(() => {
    // App initialization if needed
    console.log("Autonote app initialized");
  });
</script>

<main>
  {#if $isVaultOpen}
    <MainLayout />
  {:else}
    <VaultSelection />
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto",
      "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans",
      "Helvetica Neue", sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    background-color: #f8f9fa;
    color: #333;
  }

  :global(*) {
    box-sizing: border-box;
  }

  :global(input, textarea, button) {
    font-family: inherit;
  }

  :global(input:focus, textarea:focus) {
    outline: 2px solid #4a90e2;
    outline-offset: 2px;
  }

  :global(button:focus) {
    outline: 2px solid #4a90e2;
    outline-offset: 2px;
  }

  :global(.btn-primary) {
    background-color: #4a90e2;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  :global(.btn-primary:hover:not(:disabled)) {
    background-color: #357abd;
  }

  :global(.btn-primary:disabled) {
    background-color: #ccc;
    cursor: not-allowed;
  }

  :global(.btn-secondary) {
    background-color: #f8f9fa;
    color: #333;
    border: 1px solid #dee2e6;
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  :global(.btn-secondary:hover) {
    background-color: #e9ecef;
  }

  :global(.btn-danger) {
    background-color: #dc3545;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  :global(.btn-danger:hover) {
    background-color: #c82333;
  }

  main {
    height: 100vh;
    overflow: hidden;
  }

  /* Scrollbar styles */
  :global(::-webkit-scrollbar) {
    width: 8px;
  }

  :global(::-webkit-scrollbar-track) {
    background: #f1f1f1;
  }

  :global(::-webkit-scrollbar-thumb) {
    background: #c1c1c1;
    border-radius: 4px;
  }

  :global(::-webkit-scrollbar-thumb:hover) {
    background: #a1a1a1;
  }

  /* Loading animations */
  :global(.fade-in) {
    animation: fadeIn 0.3s ease-in-out;
  }

  @keyframes fadeIn {
    0% {
      opacity: 0;
      transform: translateY(10px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  :global(.slide-in-right) {
    animation: slideInRight 0.3s ease-out;
  }

  @keyframes slideInRight {
    0% {
      opacity: 0;
      transform: translateX(20px);
    }
    100% {
      opacity: 1;
      transform: translateX(0);
    }
  }
</style>
