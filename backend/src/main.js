// Autonote - A multi-device note-taking app powered by Autobase

const Autobase = require('autobase')
const BlindPairing = require('blind-pairing')
const HyperDB = require('hyperdb')
const Hyperbee = require('hyperbee')
const Hyperswarm = require('hyperswarm')
const ReadyResource = require('ready-resource')
const z32 = require('z32')
const b4a = require('b4a')
const { Router, dispatch } = require('./spec/hyperdispatch')
const db = require('./spec/db/index.js') // Uncomment after running schema builder
const { nanoid } = require('nanoid')

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

    // Register handlers for all commands
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
    })

    // Group operations
    this.router.add('@autonote/create-group', async (data, context) => {
      await context.view.insert('@autonote/groups', data)
    })

    this.router.add('@autonote/update-group', async (data, context) => {
      await context.view.insert('@autonote/groups', data)
    })

    this.router.add('@autonote/delete-group', async (data, context) => {
      await context.view.delete('@autonote/groups', { id: data.id })
    })

    // Page operations
    this.router.add('@autonote/create-page', async (data, context) => {
      await context.view.insert('@autonote/pages', data)
    })

    this.router.add('@autonote/update-page', async (data, context) => {
      await context.view.insert('@autonote/pages', data)
    })

    this.router.add('@autonote/delete-page', async (data, context) => {
      await context.view.delete('@autonote/pages', { id: data.id })
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
      if (!this.base._interrupting) this.emit('update')
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
      id, // ensure ID doesn't change
      updatedAt: Date.now()
    }

    await this.base.append(dispatch('@autonote/update-group', group))
    return group
  }

  async deleteGroup(id) {
    // Check if group has pages
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

  // Page methods
  async createPage(title, content = '', groupId = null, options = {}) {
    const page = {
      id: nanoid(),
      title,
      content,
      groupId,
      tags: JSON.stringify(options.tags || []),
      starred: options.starred || false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    await this.base.append(dispatch('@autonote/create-page', page))
    return { ...page, tags: JSON.parse(page.tags) }
  }

  async updatePage(id, updates) {
    const existing = await this.getPage(id)
    if (!existing) throw new Error('Page not found')

    // Handle tags - existing.tags is already parsed to array by getPage
    const page = {
      ...existing,
      ...updates,
      id, // ensure ID doesn't change
      tags: JSON.stringify(updates.tags !== undefined ? updates.tags : existing.tags),
      updatedAt: Date.now()
    }

    await this.base.append(dispatch('@autonote/update-page', page))
    return { ...page, tags: JSON.parse(page.tags) }
  }

  async deletePage(id) {
    // TODO Also delete associated file references
    // const filerefs = await this.getFileRefs(id)
    // for (const ref of filerefs) {
    //   await this.deleteFileRef(ref.id)
    // }
    //
    await this.base.append(dispatch('@autonote/delete-page', { id }))
  }

  async getPage(id) {
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

    return pages.map(page => ({ ...page, tags: JSON.parse(page.tags || '[]') }))
  }

  async getPagesByGroup(groupId) {
    return await this.listPages({ groupId })
  }

  async searchPages(searchTerm) {
    // Simple search - in future could use proper indexing
    const allPages = await this.listPages()
    const term = searchTerm.toLowerCase()

    return allPages.filter(page =>
      page.title.toLowerCase().includes(term) ||
      page.content.toLowerCase().includes(term) ||
      page.tags.some(tag => tag.toLowerCase().includes(term))
    )
  }

  // File reference methods (for future use)
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

  // Writer management (same as autopass)
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

  // Pairing methods (same as autopass)
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
        this.store.replicate(connection)
      })
    }
    this.pairing = new BlindPairing(this.swarm)
    this.member = this.pairing.addMember({
      discoveryKey: this.base.discoveryKey,
      onadd: async (candidate) => {
        const id = candidate.inviteId
        const inv = await this.base.view.findOne('@autonote/invite', {})
        if (!b4a.equals(inv.id, id)) {
          return
        }
        candidate.open(inv.publicKey)
        await this.addWriter(candidate.userData)
        candidate.confirm({
          key: this.base.key,
          encryptionKey: this.base.encryptionKey
        })
      }
    })
    this.swarm.join(this.base.discoveryKey)
  }
}

function noop() { }

module.exports = Autonote
