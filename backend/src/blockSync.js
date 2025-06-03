// backend/src/blockSync.js
const EventEmitter = require('events');

class BlockSyncManager extends EventEmitter {
  constructor(autonote) {
    super();
    this.autonote = autonote;
    this.connectedPeers = new Set();
    this.activeBlockEditors = new Map(); // blockId -> Set of peers
    this.blockVersions = new Map(); // blockId -> version
    this.operationQueue = new Map(); // blockId -> operations[]

    this._setupListeners();
  }

  _setupListeners() {
    // When a peer connects
    this.autonote.on('peer-connected', (peerInfo) => {
      const peerId = peerInfo.publicKey.toString('hex').slice(0, 8);
      this.connectedPeers.add(peerId);
      this.emit('peer-status-change', { peerId, status: 'connected', peers: this.connectedPeers.size });
    });

    // When a peer disconnects
    this.autonote.on('peer-disconnected', (peerInfo) => {
      const peerId = peerInfo.publicKey.toString('hex').slice(0, 8);
      this.connectedPeers.delete(peerId);

      // Remove peer from active editors
      for (const [blockId, editors] of this.activeBlockEditors.entries()) {
        if (editors.has(peerId)) {
          editors.delete(peerId);
          if (editors.size === 0) {
            this.activeBlockEditors.delete(blockId);
          }
          this.emit('editor-status-change', { blockId, peerId, status: 'inactive', activeEditors: editors.size });
        }
      }

      this.emit('peer-status-change', { peerId, status: 'disconnected', peers: this.connectedPeers.size });
    });

    // When a block is created
    this.autonote.on('block:created', (block) => {
      this.blockVersions.set(block.id, block.version);
      this.emit('block-created', block);
    });

    // When a block is updated
    this.autonote.on('block:updated', (block) => {
      this.blockVersions.set(block.id, block.version);
      this.emit('block-updated', block);
    });

    // When a block is deleted
    this.autonote.on('block:deleted', ({ id }) => {
      this.blockVersions.delete(id);
      this.operationQueue.delete(id);
      this.activeBlockEditors.delete(id);
      this.emit('block-deleted', { id });
    });

    // When an operation is applied
    this.autonote.on('block:operation-applied', ({ operation, block }) => {
      // Update the block version
      this.blockVersions.set(block.id, block.version);

      // Process operation queue
      const queue = this.operationQueue.get(block.id) || [];
      const remainingOps = queue.filter(op => op.id !== operation.id);

      if (remainingOps.length > 0) {
        this.operationQueue.set(block.id, remainingOps);
      } else {
        this.operationQueue.delete(block.id);
      }

      this.emit('operation-applied', { operation, block });
    });
  }

  // Register a peer as actively editing a block
  registerActiveEditor(blockId, peerId) {
    if (!this.activeBlockEditors.has(blockId)) {
      this.activeBlockEditors.set(blockId, new Set());
    }

    const editors = this.activeBlockEditors.get(blockId);
    const isNew = !editors.has(peerId);

    editors.add(peerId);

    if (isNew) {
      this.emit('editor-status-change', { blockId, peerId, status: 'active', activeEditors: editors.size });
    }

    return { activeEditors: editors.size, peers: Array.from(editors) };
  }

  // Unregister a peer as actively editing a block
  unregisterActiveEditor(blockId, peerId) {
    if (!this.activeBlockEditors.has(blockId)) return { activeEditors: 0, peers: [] };

    const editors = this.activeBlockEditors.get(blockId);
    const wasActive = editors.has(peerId);

    if (wasActive) {
      editors.delete(peerId);

      if (editors.size === 0) {
        this.activeBlockEditors.delete(blockId);
      }

      this.emit('editor-status-change', { blockId, peerId, status: 'inactive', activeEditors: editors.size });
    }

    return { activeEditors: editors.size, peers: Array.from(editors) };
  }

  // Queue an operation for a block
  queueOperation(blockId, operation) {
    if (!this.operationQueue.has(blockId)) {
      this.operationQueue.set(blockId, []);
    }

    const queue = this.operationQueue.get(blockId);
    queue.push(operation);

    return { queueLength: queue.length };
  }

  // Get active editors for a block
  getActiveEditors(blockId) {
    if (!this.activeBlockEditors.has(blockId)) return [];
    return Array.from(this.activeBlockEditors.get(blockId));
  }

  // Get current block version
  getBlockVersion(blockId) {
    return this.blockVersions.get(blockId) || 0;
  }

  // Check if a block has pending operations
  hasPendingOperations(blockId) {
    return this.operationQueue.has(blockId) && this.operationQueue.get(blockId).length > 0;
  }

  // Get connection status
  getConnectionStatus() {
    return {
      connected: this.connectedPeers.size > 0,
      peerCount: this.connectedPeers.size,
      peers: Array.from(this.connectedPeers)
    };
  }
}

module.exports = BlockSyncManager;
