// frontend/svelte/src/lib/blockSync.ts
import { writable, derived } from 'svelte/store';
import { ipc } from './ipc';
import type { Block, BlockOperation } from './types';

// Stores for sync status
export const blockEditors = writable<Map<string, string[]>>(new Map());
export const blockPendingOps = writable<Map<string, number>>(new Map());
export const blockVersions = writable<Map<string, number>>(new Map());
export const activePeers = writable<string[]>([]);

// Operation queue for handling local changes before they're confirmed
const localOperationQueue = new Map<string, BlockOperation[]>();

// Setup listeners for real-time updates
export function setupBlockSyncListeners() {
  // Listen for peer status changes
  ipc.on('block-sync:peer-status-change', (data: any) => {
    if (data.status === 'connected') {
      activePeers.update(peers => {
        if (!peers.includes(data.peerId)) {
          return [...peers, data.peerId];
        }
        return peers;
      });
    } else {
      activePeers.update(peers => peers.filter(id => id !== data.peerId));
    }
  });

  // Listen for editor status changes
  ipc.on('block-sync:editor-status-change', (data: any) => {
    blockEditors.update(editors => {
      const newEditors = new Map(editors);

      if (data.status === 'active') {
        const currentEditors = newEditors.get(data.blockId) || [];
        if (!currentEditors.includes(data.peerId)) {
          newEditors.set(data.blockId, [...currentEditors, data.peerId]);
        }
      } else {
        const currentEditors = newEditors.get(data.blockId) || [];
        newEditors.set(
          data.blockId,
          currentEditors.filter(id => id !== data.peerId)
        );

        if (newEditors.get(data.blockId)?.length === 0) {
          newEditors.delete(data.blockId);
        }
      }

      return newEditors;
    });
  });

  // Listen for block updates
  ipc.on('block-sync:block-updated', (block: Block) => {
    blockVersions.update(versions => {
      const newVersions = new Map(versions);
      newVersions.set(block.id, block.version);
      return newVersions;
    });

    // Remove pending operations that have been applied
    blockPendingOps.update(pending => {
      const newPending = new Map(pending);
      newPending.delete(block.id);
      return newPending;
    });
  });

  // Listen for operations being applied
  ipc.on('block-sync:operation-applied', (data: { operation: any, block: Block }) => {
    blockVersions.update(versions => {
      const newVersions = new Map(versions);
      newVersions.set(data.block.id, data.block.version);
      return newVersions;
    });

    // Remove the operation from local queue
    const queue = localOperationQueue.get(data.block.id) || [];
    const remainingOps = queue.filter(op =>
      !(op.type === data.operation.type &&
        op.position === data.operation.position &&
        op.value === data.operation.value)
    );

    if (remainingOps.length > 0) {
      localOperationQueue.set(data.block.id, remainingOps);
    } else {
      localOperationQueue.delete(data.block.id);
    }

    // Update pending operations count
    blockPendingOps.update(pending => {
      const newPending = new Map(pending);

      if (remainingOps.length > 0) {
        newPending.set(data.block.id, remainingOps.length);
      } else {
        newPending.delete(data.block.id);
      }

      return newPending;
    });
  });
}

// Start tracking edits on a block
export async function startEditingBlock(blockId: string, peerId?: string) {
  if (!peerId) {
    // Generate a local peer ID if not provided
    peerId = `local-${Math.random().toString(36).substring(2, 10)}`;
  }

  try {
    await ipc.invoke('block-sync:register-editor', { blockId, peerId });
    return true;
  } catch (error) {
    console.error('Failed to register as active editor:', error);
    return false;
  }
}

// Stop tracking edits on a block
export async function stopEditingBlock(blockId: string, peerId?: string) {
  if (!peerId) {
    return false;
  }

  try {
    await ipc.invoke('block-sync:unregister-editor', { blockId, peerId });
    return true;
  } catch (error) {
    console.error('Failed to unregister as active editor:', error);
    return false;
  }
}

// Queue a local operation before sending to backend
export function queueLocalOperation(blockId: string, operation: BlockOperation) {
  if (!localOperationQueue.has(blockId)) {
    localOperationQueue.set(blockId, []);
  }

  const queue = localOperationQueue.get(blockId)!;
  queue.push(operation);

  // Update the pending operations store
  blockPendingOps.update(pending => {
    const newPending = new Map(pending);
    newPending.set(blockId, queue.length);
    return newPending;
  });

  return queue.length;
}

// Derived store for blocks with active editors
export const blocksWithActiveEditors = derived(blockEditors, ($blockEditors) => {
  return Array.from($blockEditors.keys());
});

// Derived store for connection status
export const isConnected = derived(activePeers, ($activePeers) => $activePeers.length > 0);

// Derived store for blocks with pending operations
export const blocksWithPendingOps = derived(blockPendingOps, ($blockPendingOps) => {
  return Array.from($blockPendingOps.keys());
});
