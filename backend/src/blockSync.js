// backend/src/blockSync.js
const EventEmitter = require('events')

class BlockSyncManager extends EventEmitter {
  constructor(autonote) {
    super()
    this.autonote = autonote
    this.activeEditors = new Map() // blockId -> Set of peerIds
    this.connectedPeers = new Set()
    this.blockVersions = new Map() // blockId -> version
    this.pendingOperations = new Map() // blockId -> operations[]

    this.setupEventListeners()
  }

  setupEventListeners() {
    // Listen for peer connections
    this.autonote.on('peer-connected', (peerInfo) => {
      const peerId = peerInfo.publicKey.toString('hex').slice(0, 8)
      this.connectedPeers.add(peerId)
      this.emit('peer-status-change', { peerId, status: 'connected' })
    })

    this.autonote.on('peer-disconnected', (peerInfo) => {
      const peerId = peerInfo.publicKey.toString('hex').slice(0, 8)
      this.connectedPeers.delete(peerId)

      // Remove from active editors
      for (const [blockId, editors] of this.activeEditors.entries()) {
        if (editors.has(peerId)) {
          editors.delete(peerId)
          this.emit('editor-status-change', {
            blockId,
            peerId,
            status: 'inactive'
          })

          if (editors.size === 0) {
            this.activeEditors.delete(blockId)
          }
        }
      }

      this.emit('peer-status-change', { peerId, status: 'disconnected' })
    })

    // Listen for block events
    this.autonote.on('block:created', (block) => {
      this.blockVersions.set(block.id, block.version)
      this.emit('block-created', block)
    })

    this.autonote.on('block:updated', (block) => {
      this.blockVersions.set(block.id, block.version)
      this.emit('block-updated', block)
    })

    this.autonote.on('block:deleted', (data) => {
      this.blockVersions.delete(data.id)
      this.activeEditors.delete(data.id)
      this.pendingOperations.delete(data.id)
      this.emit('block-deleted', data)
    })

    this.autonote.on('block:operation-applied', (data) => {
      const blockId = data.operation.blockId

      // Remove matching pending operations
      const pending = this.pendingOperations.get(blockId) || []
      const filtered = pending.filter(op =>
        !(op.type === data.operation.type &&
          op.position === data.operation.position &&
          op.value === data.operation.value)
      )

      if (filtered.length > 0) {
        this.pendingOperations.set(blockId, filtered)
      } else {
        this.pendingOperations.delete(blockId)
      }

      this.emit('operation-applied', data)
    })
  }

  registerActiveEditor(blockId, peerId) {
    if (!this.activeEditors.has(blockId)) {
      this.activeEditors.set(blockId, new Set())
    }

    const editors = this.activeEditors.get(blockId)
    if (!editors.has(peerId)) {
      editors.add(peerId)
      this.emit('editor-status-change', {
        blockId,
        peerId,
        status: 'active'
      })
    }

    return true
  }

  unregisterActiveEditor(blockId, peerId) {
    const editors = this.activeEditors.get(blockId)
    if (editors && editors.has(peerId)) {
      editors.delete(peerId)
      this.emit('editor-status-change', {
        blockId,
        peerId,
        status: 'inactive'
      })

      if (editors.size === 0) {
        this.activeEditors.delete(blockId)
      }
    }

    return true
  }

  getActiveEditors(blockId) {
    const editors = this.activeEditors.get(blockId)
    return editors ? Array.from(editors) : []
  }

  getBlockVersion(blockId) {
    return this.blockVersions.get(blockId) || 0
  }

  hasPendingOperations(blockId) {
    const pending = this.pendingOperations.get(blockId)
    return pending && pending.length > 0
  }

  addPendingOperation(blockId, operation) {
    if (!this.pendingOperations.has(blockId)) {
      this.pendingOperations.set(blockId, [])
    }
    this.pendingOperations.get(blockId).push(operation)
  }

  getConnectionStatus() {
    return {
      connected: this.connectedPeers.size > 0,
      peerCount: this.connectedPeers.size,
      peers: Array.from(this.connectedPeers)
    }
  }
}

module.exports = BlockSyncManager
