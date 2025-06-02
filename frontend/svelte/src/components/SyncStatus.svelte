<script lang="ts">
  import { syncStatus, lastSyncTime } from "../lib/stores";

  function formatSyncTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  $: syncStatusText =
    {
      synced: "Synced",
      syncing: "Syncing...",
      offline: "Offline",
      error: "Sync Error",
    }[$syncStatus] || "Unknown";

  $: syncStatusClass = `sync-status ${$syncStatus}`;
</script>

<div
  class={syncStatusClass}
  title="Last synced: {formatSyncTime($lastSyncTime)}"
>
  <div class="sync-indicator">
    {#if $syncStatus === "syncing"}
      <div class="spinner"></div>
    {:else if $syncStatus === "synced"}
      OK
    {:else if $syncStatus === "error"}
      SYNC_ERR
    {:else}
      SYNCING
    {/if}
  </div>
  <span class="sync-text">{syncStatusText}</span>
</div>

<style>
  .sync-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .sync-status.synced {
    background: #d4edda;
    color: #155724;
  }

  .sync-status.syncing {
    background: #fff3cd;
    color: #856404;
  }

  .sync-status.offline {
    background: #f8d7da;
    color: #721c24;
  }

  .sync-status.error {
    background: #f8d7da;
    color: #721c24;
  }

  .sync-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
  }

  .spinner {
    width: 10px;
    height: 10px;
    border: 1.5px solid rgba(133, 100, 4, 0.3);
    border-radius: 50%;
    border-top-color: #856404;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .sync-text {
    white-space: nowrap;
  }
</style>
