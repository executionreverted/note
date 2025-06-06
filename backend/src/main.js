// backend/src/main.js - Updated with better event handling
const Autobase = require('autobase')
const BlindPairing = require('blind-pairing')
const HyperDB = require('hyperdb')
const Hyperbee = require('hyperbee')
const Hyperswarm = require('hyperswarm')
const ReadyResource = require('ready-resource')
const z32 = require('z32')
const b4a = require('b4a')
const { Router, dispatch } = require('./spec/hyperdispatch')
const db = require('./spec/db/index.js')
const crypto = require('crypto')

function nanoid() {
  return crypto.randomBytes(16).toString('hex')
}

class AutonotePairer extends ReadyResource {
  constructor(store, invite, opts = {}) {
    super()
    this.store = store
    this.invite = invite
    this.swarm = null
    this.pairing = null
    this.candidate = null
    this.bootstrap = opts.bootstrap || null
    this.onresolve = null
    this.onreject = null
    this.note = null

    this.ready().catch(noop)
  }

  async _open() {
    await this.store.ready()
    this.swarm = new Hyperswarm({
      keyPair: await this.store.createKeyPair('hyperswarm'),
      bootstrap: this.bootstrap
    })

    const store = this.store
    this.swarm.on('connection', (connection, peerInfo) => {
      store.replicate(connection)
    })

    this.pairing = new BlindPairing(this.swarm)
    const core = Autobase.getLocalCore(this.store)
    await core.ready()
    const key = core.key
    await core.close()
    this.candidate = this.pairing.addCandidate({
      invite: z32.decode(this.invite),
      userData: key,
      onadd: async (result) => {
        if (this.note === null) {
          this.note = new Autonote(this.store, {
            swarm: this.swarm,
            key: result.key,
            encryptionKey: result.encryptionKey,
            bootstrap: this.bootstrap
          })
        }
        this.swarm = null
        this.store = null
        if (this.onresolve) this._whenWritable()
        this.candidate.close().catch(noop)
      }
    })
  }

  _whenWritable() {
    if (this.note.base.writable) return
    const check = () => {
      if (this.note.base.writable) {
        this.note.base.off('update', check)
        this.onresolve(this.note)
      }
    }
    this.note.base.on('update', check)
  }

  async _close() {
    if (this.candidate !== null) {
      await this.candidate.close()
    }

    if (this.swarm !== null) {
      await this.swarm.destroy()
    }

    if (this.store !== null) {
      await this.store.close()
    }

    if (this.onreject) {
      this.onreject(new Error('Pairing closed'))
    } else if (this.base) {
      await this.base.close()
    }
  }

  finished() {
    return new Promise((resolve, reject) => {
      this.onresolve = resolve
      this.onreject = reject
    })
  }
}

class Autonote extends ReadyResource {
  constructor(corestore, opts = {}) {
    super()
    this.router = new Router()
    this.store = corestore
    this.swarm = opts.swarm || null
    this.base = null
    this.bootstrap = opts.bootstrap || null
    this.member = null
    this.pairing = null
    this.replicate = opts.replicate !== false
    this.debug = !!opts.key
    this.lastEmittedHashes = new Map() // Track emitted data to prevent duplicate events

    this.blockManager = null;
    this.blockSyncManager = null;
    this._registerHandlers()
    this._boot(opts)
    this.ready().catch(noop)
  }

  _registerHandlers() {
    // Writer management
    this.router.add('@autonote/remove-writer', async (data, context) => {
      await context.base.removeWriter(data.key)
    })

    this.router.add('@autonote/add-writer', async (data, context) => {
      await context.base.addWriter(data.key)
    })

    // Profile operations
    this.router.add('@autonote/update-profile', async (data, context) => {
      await context.view.insert('@autonote/profile', data)
      this._emitProfileUpdate(data)
    })

    // Group operations
    this.router.add('@autonote/create-group', async (data, context) => {
      await context.view.insert('@autonote/groups', data)
      this._emitGroupCreated(data)
    })

    this.router.add('@autonote/update-group', async (data, context) => {
      await context.view.insert('@autonote/groups', data)
      this._emitGroupUpdated(data)
    })

    this.router.add('@autonote/delete-group', async (data, context) => {
      await context.view.delete('@autonote/groups', { id: data.id })
      this._emitGroupDeleted(data)
    })

    // Version-aware page operations
    this.router.add('@autonote/create-page', async (data, context) => {
      // Add version metadata
      const versionedData = {
        ...data,
        version: data.updatedAt,
        authorKey: context.base.local?.key?.toString('hex').slice(0, 8) || 'unknown'
      }
      await context.view.insert('@autonote/pages', versionedData)

      // Emit clean data without version metadata
      const { version, authorKey, baseVersion, ...cleanData } = data
      const pageData = { ...cleanData, tags: JSON.parse(cleanData.tags || '[]') }
      this._emitPageCreated(pageData)
    })

    this.router.add('@autonote/update-page', async (data, context) => {
      const versionedData = {
        ...data,
        version: data.updatedAt,
        authorKey: context.base.local?.key?.toString('hex').slice(0, 8) || 'unknown'
      }
      await context.view.insert('@autonote/pages', versionedData)

      const { version, authorKey, baseVersion, ...cleanData } = data
      const pageData = { ...cleanData, tags: JSON.parse(cleanData.tags || '[]') }
      this._emitPageUpdated(pageData)
    })

    this.router.add('@autonote/delete-page', async (data, context) => {
      await context.view.delete('@autonote/pages', { id: data.id })
      this._emitPageDeleted(data)
    })

    // File reference operations
    this.router.add('@autonote/add-fileref', async (data, context) => {
      await context.view.insert('@autonote/filerefs', data)
    })

    this.router.add('@autonote/delete-fileref', async (data, context) => {
      await context.view.delete('@autonote/filerefs', { id: data.id })
    })

    // Invite operations
    this.router.add('@autonote/add-invite', async (data, context) => {
      await context.view.insert('@autonote/invite', data)
    })

    this.router.add('@autonote/del-invite', async (data, context) => {
      await context.view.delete('@autonote/invite', { id: data.id })
    })
    // Block operations
    this.router.add('@autonote/create-block', async (data, context) => {
      await context.view.insert('@autonote/blocks', data);
      this._emitBlockCreated(data);
    });

    this.router.add('@autonote/update-block', async (data, context) => {
      await context.view.insert('@autonote/blocks', data);
      this._emitBlockUpdated(data);
    });

    this.router.add('@autonote/delete-block', async (data, context) => {
      // Mark as deleted by updating type to '_deleted'
      data.type = '_deleted';
      await context.view.insert('@autonote/blocks', data);
      this._emitBlockDeleted(data);
    });

    this.router.add('@autonote/apply-operation', async (data, context) => {
      await context.view.insert('@autonote/operations', data);
      this._emitOperationApplied(data);
    });
  }

  _emitBlockCreated(data) {
    const hash = this._getDataHash(data);
    if (this.lastEmittedHashes.get(`block:created:${data.id}`) !== hash) {
      this.lastEmittedHashes.set(`block:created:${data.id}`, hash);
      this.emit('block:created', data);
    }
  }

  _emitBlockUpdated(data) {
    const hash = this._getDataHash(data);
    if (this.lastEmittedHashes.get(`block:updated:${data.id}`) !== hash) {
      this.lastEmittedHashes.set(`block:updated:${data.id}`, hash);
      this.emit('block:updated', data);
    }
  }

  _emitBlockDeleted(data) {
    this.emit('block:deleted', { id: data.id });
  }

  _emitOperationApplied(data) {
    const hash = this._getDataHash(data);
    const key = `operation:applied:${data.blockId}:${data.id}`;
    if (this.lastEmittedHashes.get(key) !== hash) {
      this.lastEmittedHashes.set(key, hash);
      this.emit('block:operation-applied', { operation: data });
    }
  }

  // Event emission helpers to prevent duplicate events
  _emitProfileUpdate(data) {
    const hash = this._getDataHash(data)
    if (this.lastEmittedHashes.get('profile') !== hash) {
      this.lastEmittedHashes.set('profile', hash)
      this.emit('profile:updated', data)
    }
  }

  _emitGroupCreated(data) {
    const hash = this._getDataHash(data)
    if (this.lastEmittedHashes.get(`group:created:${data.id}`) !== hash) {
      this.lastEmittedHashes.set(`group:created:${data.id}`, hash)
      this.emit('group:created', data)
    }
  }

  _emitGroupUpdated(data) {
    const hash = this._getDataHash(data)
    if (this.lastEmittedHashes.get(`group:updated:${data.id}`) !== hash) {
      this.lastEmittedHashes.set(`group:updated:${data.id}`, hash)
      this.emit('group:updated', data)
    }
  }

  _emitGroupDeleted(data) {
    this.emit('group:deleted', data)
  }

  _emitPageCreated(data) {
    const hash = this._getDataHash(data)
    if (this.lastEmittedHashes.get(`page:created:${data.id}`) !== hash) {
      this.lastEmittedHashes.set(`page:created:${data.id}`, hash)
      this.emit('page:created', data)
    }
  }

  _emitPageUpdated(data) {
    const hash = this._getDataHash(data)
    if (this.lastEmittedHashes.get(`page:updated:${data.id}`) !== hash) {
      this.lastEmittedHashes.set(`page:updated:${data.id}`, hash)
      this.emit('page:updated', data)
    }
  }

  _emitPageDeleted(data) {
    this.emit('page:deleted', data)
  }

  _getDataHash(data) {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16)
  }

  _boot(opts = {}) {
    const { encryptionKey, key } = opts

    this.base = new Autobase(this.store, key, {
      encrypt: true,
      encryptionKey,
      open(store) {
        return HyperDB.bee(store.get('view'), db, {
          extension: false,
          autoUpdate: true
        })
      },
      apply: this._apply.bind(this)
    })

    this.base.on('update', () => {
      if (!this.base._interrupting) {
        console.log('Autobase update detected - peer changes')
        this.emit('update')
      }
    })
  }

  async _apply(nodes, view, base) {
    for (const node of nodes) {
      await this.router.dispatch(node.value, { view, base })
    }
    await view.flush()
  }

  async _open() {
    await this.base.ready()
    if (this.replicate) await this._replicate()
  }

  async _initBlockManager() {
    if (!this.blockManager) {
      const BlockManager = require('./blockManager');
      this.blockManager = new BlockManager(this);
    }
    return this.blockManager;
  }

  async _initBlockSyncManager() {
    if (!this.blockSyncManager) {
      const BlockSyncManager = require('./blockSync');
      this.blockSyncManager = new BlockSyncManager(this);

      // Forward events
      this.blockSyncManager.on('peer-status-change', (data) => {
        this.emit('block-sync:peer-status-change', data);
      });

      this.blockSyncManager.on('editor-status-change', (data) => {
        this.emit('block-sync:editor-status-change', data);
      });

      this.blockSyncManager.on('block-created', (data) => {
        this.emit('block-sync:block-created', data);
      });

      this.blockSyncManager.on('block-updated', (data) => {
        this.emit('block-sync:block-updated', data);
      });

      this.blockSyncManager.on('block-deleted', (data) => {
        this.emit('block-sync:block-deleted', data);
      });

      this.blockSyncManager.on('operation-applied', (data) => {
        this.emit('block-sync:operation-applied', data);
      });
    }

    return this.blockSyncManager;
  }

  async _close() {
    if (this.swarm) {
      await this.member.close()
      await this.pairing.close()
      await this.swarm.destroy()
    }
    await this.base.close()
  }

  get writerKey() {
    return this.base.local.key
  }

  get key() {
    return this.base.key
  }

  get discoveryKey() {
    return this.base.discoveryKey
  }

  get encryptionKey() {
    return this.base.encryptionKey
  }

  get writable() {
    return this.base.writable
  }

  // Profile methods
  async getProfile() {
    const profiles = await (await this.base.view.find('@autonote/profile', {})).toArray()
    return profiles.length > 0 ? profiles[0] : null
  }

  async updateProfile(profile) {
    const now = Date.now()
    const existing = await this.getProfile()

    const data = {
      ...profile,
      userId: profile.userId || existing?.userId || nanoid(),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    }

    await this.base.append(dispatch('@autonote/update-profile', data))
    return data
  }

  // Group methods
  async createGroup(name, parentId = null, options = {}) {
    const group = {
      id: nanoid(),
      name,
      parentId,
      color: options.color,
      icon: options.icon,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    await this.base.append(dispatch('@autonote/create-group', group))
    return group
  }

  async updateGroup(id, updates) {
    const existing = await this.getGroup(id)
    if (!existing) throw new Error('Group not found')

    const group = {
      ...existing,
      ...updates,
      id,
      updatedAt: Date.now()
    }

    await this.base.append(dispatch('@autonote/update-group', group))
    return group
  }

  async deleteGroup(id) {
    const pages = await this.getPagesByGroup(id)
    if (pages.some(p => p.groupId == id)) {
      throw new Error('Cannot delete group with pages')
    }

    await this.base.append(dispatch('@autonote/delete-group', { id }))
  }

  async getGroup(id) {
    return (await this.base.view.get('@autonote/groups', { id }))
  }

  async listGroups() {
    return await (await this.base.view.find('@autonote/groups', {})).toArray()
  }

  // Version-aware page methods
  async createPage(title, content = '', groupId = null, options = {}) {
    const now = Date.now()
    const page = {
      id: nanoid(),
      title,
      content,
      groupId,
      tags: JSON.stringify(options.tags || []),
      starred: options.starred || false,
      createdAt: now,
      updatedAt: now,
      version: now
    }

    await this.base.append(dispatch('@autonote/create-page', page))
    return { ...page, tags: JSON.parse(page.tags) }
  }

  async updatePage(id, updates, baseVersion = null) {
    const existing = await this.getPage(id)
    if (!existing) throw new Error('Page not found')

    const now = Date.now()
    const page = {
      ...existing,
      ...updates,
      id,
      tags: JSON.stringify(updates.tags !== undefined ? updates.tags : existing.tags),
      updatedAt: now
    }

    await this.base.append(dispatch('@autonote/update-page', page))

    return { ...page, tags: JSON.parse(page.tags) }
  }

  async deletePage(id) {
    // First get all blocks associated with this page
    const blocks = await this.getBlocksByPage(id);

    // Delete each block using the block manager
    const blockManager = await this.getBlockManager();
    for (const block of blocks) {
      await blockManager.deleteBlock(block.id);
    }

    // Then delete the page itself
    await this.base.append(dispatch('@autonote/delete-page', { id }));
  }

  async getPage(id) {
    const page = (await this.base.view.get('@autonote/pages', { id }))
    if (page) {
      const { version, authorKey, hasConflict, conflictWith, baseVersion, ...cleanPage } = page
      return { ...cleanPage, tags: JSON.parse(cleanPage.tags || '[]') }
    }
    return null
  }

  async getPageWithVersion(id) {
    const page = (await this.base.view.get('@autonote/pages', { id }))
    if (page) {
      return { ...page, tags: JSON.parse(page.tags || '[]') }
    }
    return null
  }

  async listPages(options = {}) {
    const query = {}

    if (options.groupId !== undefined) {
      query.groupId = options.groupId
    }

    if (options.starred !== undefined) {
      query.starred = options.starred
    }

    const pages = await (await this.base.view.find('@autonote/pages', query)).toArray()

    // Clean up version metadata for frontend
    return pages.map(page => {
      const { version, authorKey, hasConflict, conflictWith, baseVersion, ...cleanPage } = page
      return { ...cleanPage, tags: JSON.parse(cleanPage.tags || '[]') }
    })
  }

  async getPagesByGroup(groupId) {
    return await this.listPages({ groupId })
  }

  async searchPages(searchTerm) {
    const allPages = await this.listPages()
    const term = searchTerm.toLowerCase()

    return allPages.filter(page =>
      page.title.toLowerCase().includes(term) ||
      page.content.toLowerCase().includes(term) ||
      page.tags.some(tag => tag.toLowerCase().includes(term))
    )
  }

  // File reference methods
  async addFileRef(pageId, filename, options = {}) {
    const fileref = {
      id: nanoid(),
      pageId,
      filename,
      mimeType: options.mimeType,
      size: options.size,
      driveKey: options.driveKey,
      blobId: options.blobId,
      createdAt: Date.now()
    }

    await this.base.append(dispatch('@autonote/add-fileref', fileref))
    return fileref
  }

  async deleteFileRef(id) {
    await this.base.append(dispatch('@autonote/delete-fileref', { id }))
  }

  async getFileRefs(pageId) {
    return await this.base.view.find('@autonote/filerefs', { pageId })
  }

  // Writer management
  async addWriter(key) {
    await this.base.append(dispatch('@autonote/add-writer', {
      key: b4a.isBuffer(key) ? key : b4a.from(key)
    }))
    return true
  }

  async removeWriter(key) {
    await this.base.append(dispatch('@autonote/remove-writer', {
      key: b4a.isBuffer(key) ? key : b4a.from(key)
    }))
  }

  // Pairing methods
  static pair(store, invite, opts) {
    return new AutonotePairer(store, invite, opts)
  }

  async createInvite(opts) {
    if (this.opened === false) await this.ready()
    const existing = await this.base.view.findOne('@autonote/invite', {})
    if (existing) {
      return z32.encode(existing.invite)
    }
    const { id, invite, publicKey, expires } = BlindPairing.createInvite(this.base.key)

    const record = { id, invite, publicKey, expires }
    await this.base.append(dispatch('@autonote/add-invite', record))
    return z32.encode(record.invite)
  }

  async deleteInvite() {
    if (this.opened === false) await this.ready()
    const existing = await this.base.view.findOne('@autonote/invite', {})
    if (existing) {
      await this.base.append(dispatch('@autonote/del-invite', existing))
    }
  }

  async _replicate() {
    await this.base.ready()
    if (this.swarm === null) {
      this.swarm = new Hyperswarm({
        keyPair: await this.store.createKeyPair('hyperswarm'),
        bootstrap: this.bootstrap
      })
      this.swarm.on('connection', (connection, peerInfo) => {
        console.log('Peer connected:', peerInfo.publicKey.toString('hex').slice(0, 8))
        this.store.replicate(connection)
        this.emit('peer-connected', peerInfo)
      })

      this.swarm.on('disconnection', (connection, peerInfo) => {
        console.log('Peer disconnected:', peerInfo.publicKey.toString('hex').slice(0, 8))
        this.emit('peer-disconnected', peerInfo)
      })
    }
    this.pairing = new BlindPairing(this.swarm)
    this.member = this.pairing.addMember({
      discoveryKey: this.base.discoveryKey,
      onadd: async (candidate) => {
        const id = candidate.inviteId
        const inv = await this.base.view.findOne('@autonote/invite', {})
        if (!inv || !b4a.equals(inv.id, id)) {
          return
        }
        candidate.open(inv.publicKey)
        await this.addWriter(candidate.userData)
        candidate.confirm({
          key: this.base.key,
          encryptionKey: this.base.encryptionKey
        })
        console.log('New writer added via pairing')
      }
    })
    this.swarm.join(this.base.discoveryKey)
  }


  async getBlockManager() {
    await this.ready();
    return await this._initBlockManager();
  }

  async createBlock(pageId, type, content, options = {}) {
    const blockManager = await this.getBlockManager();
    return await blockManager.createBlock(pageId, type, content, options);
  }

  async updateBlock(id, updates) {
    const blockManager = await this.getBlockManager();
    return await blockManager.updateBlock(id, updates);
  }

  async deleteBlock(id) {
    const blockManager = await this.getBlockManager();
    return await blockManager.deleteBlock(id);
  }

  async getBlock(id) {
    const blockManager = await this.getBlockManager();
    return await blockManager.getBlock(id);
  }

  async getBlocksByPage(pageId) {
    const blockManager = await this.getBlockManager();
    return await blockManager.getBlocksByPage(pageId);
  }

  async applyBlockOperation(blockId, operation) {
    const blockManager = await this.getBlockManager();
    return await blockManager.applyOperation(blockId, operation);
  }

  async moveBlock(id, newPosition, newParentId) {
    const blockManager = await this.getBlockManager();
    return await blockManager.moveBlock(id, newPosition, newParentId);
  }

  async migratePageToBlocks(pageId) {
    const page = await this.getPage(pageId);
    if (!page) throw new Error('Page not found');

    const blockManager = await this.getBlockManager();
    return await blockManager.migratePageToBlocks(page);
  }

  async getBlockSyncManager() {
    await this.ready();
    return await this._initBlockSyncManager();
  }

  async registerActiveEditor(blockId, peerId) {
    const syncManager = await this.getBlockSyncManager();
    return syncManager.registerActiveEditor(blockId, peerId);
  }

  async unregisterActiveEditor(blockId, peerId) {
    const syncManager = await this.getBlockSyncManager();
    return syncManager.unregisterActiveEditor(blockId, peerId);
  }

  async getBlockSyncStatus(blockId) {
    const syncManager = await this.getBlockSyncManager();
    return {
      version: syncManager.getBlockVersion(blockId),
      activeEditors: syncManager.getActiveEditors(blockId),
      hasPendingOperations: syncManager.hasPendingOperations(blockId),
      connectionStatus: syncManager.getConnectionStatus()
    };
  }
}

function noop() { }

module.exports = Autonote
