const Hyperschema = require('hyperschema')
const HyperdbBuilder = require('hyperdb/builder')
const Hyperdispatch = require('hyperdispatch')

// SCHEMA CREATION START //
const autonote = Hyperschema.from('./spec/schema')
const template = autonote.namespace('autonote')

template.register({
  name: 'block',
  compact: false,
  fields: [{
    name: 'id',
    type: 'string',
    required: true
  }, {
    name: 'pageId',
    type: 'string',
    required: true
  }, {
    name: 'parentId', // For nesting blocks
    type: 'string',
    required: false
  }, {
    name: 'type', // paragraph, heading, list, code, etc.
    type: 'string',
    required: true
  }, {
    name: 'content',
    type: 'string',
    required: false
  }, {
    name: 'metadata', // JSON stringified properties specific to block type
    type: 'string',
    required: false
  }, {
    name: 'position', // For ordering blocks
    type: 'int',
    required: true
  }, {
    name: 'createdAt',
    type: 'int',
    required: true
  }, {
    name: 'updatedAt',
    type: 'int',
    required: true
  }, {
    name: 'createdBy',
    type: 'string',
    required: true
  }, {
    name: 'updatedBy',
    type: 'string',
    required: true
  }, {
    name: 'version',
    type: 'int',
    required: true
  }]
})

template.register({
  name: 'operation',
  compact: false,
  fields: [{
    name: 'id',
    type: 'string',
    required: true
  }, {
    name: 'blockId',
    type: 'string',
    required: true
  }, {
    name: 'type', // insert, delete, update, move
    type: 'string',
    required: true
  }, {
    name: 'position', // Start position for text operations
    type: 'int',
    required: false
  }, {
    name: 'length', // Length of affected text
    type: 'int',
    required: false
  }, {
    name: 'value', // Text to insert or new values
    type: 'string',
    required: false
  }, {
    name: 'timestamp',
    type: 'int',
    required: true
  }, {
    name: 'author',
    type: 'string',
    required: true
  }, {
    name: 'baseVersion',
    type: 'int', // Block version this op was based on
    required: true
  }]
})

// User profile schema
template.register({
  name: 'profile',
  compact: false,
  fields: [{
    name: 'userId',
    type: 'string',
    required: true
  }, {
    name: 'displayName',
    type: 'string',
    required: true
  }, {
    name: 'email',
    type: 'string',
    required: false
  }, {
    name: 'avatar',
    type: 'buffer',
    required: false
  }, {
    name: 'createdAt',
    type: 'int',
    required: true
  }, {
    name: 'updatedAt',
    type: 'int',
    required: true
  }]
})

// Group/folder schema for organizing pages
template.register({
  name: 'group',
  compact: false,
  fields: [{
    name: 'id',
    type: 'string',
    required: true
  }, {
    name: 'name',
    type: 'string',
    required: true
  }, {
    name: 'parentId',
    type: 'string',
    required: false // null for root groups
  }, {
    name: 'color',
    type: 'string',
    required: false
  }, {
    name: 'icon',
    type: 'string',
    required: false
  }, {
    name: 'createdAt',
    type: 'int',
    required: true
  }, {
    name: 'updatedAt',
    type: 'int',
    required: true
  }]
})

// Page/note schema
template.register({
  name: 'page',
  compact: false,
  fields: [{
    name: 'id',
    type: 'string',
    required: true
  }, {
    name: 'title',
    type: 'string',
    required: true
  }, {
    name: 'content',
    type: 'string', // markdown content
    required: false
  }, {
    name: 'groupId',
    type: 'string',
    required: false // can be null for ungrouped pages
  }, {
    name: 'tags',
    type: 'string', // JSON stringified array
    required: false
  }, {
    name: 'starred',
    type: 'bool',
    required: false
  }, {
    name: 'createdAt',
    type: 'int',
    required: true
  }, {
    name: 'updatedAt',
    type: 'int',
    required: true
  }]
})

// File reference schema (for future use)
template.register({
  name: 'fileref',
  compact: false,
  fields: [{
    name: 'id',
    type: 'string',
    required: true
  }, {
    name: 'pageId',
    type: 'string',
    required: true
  }, {
    name: 'filename',
    type: 'string',
    required: true
  }, {
    name: 'mimeType',
    type: 'string',
    required: false
  }, {
    name: 'size',
    type: 'int',
    required: false
  }, {
    name: 'driveKey',
    type: 'buffer',
    required: false
  }, {
    name: 'blobId',
    type: 'string',
    required: false
  }, {
    name: 'createdAt',
    type: 'int',
    required: true
  }]
})

// Schema for managing writers (same as autopass)
template.register({
  name: 'writer',
  compact: false,
  fields: [{
    name: 'key',
    type: 'buffer',
    required: true
  }]
})

// Delete schemas
template.register({
  name: 'delete',
  compact: false,
  fields: [{
    name: 'id',
    type: 'string',
    required: true
  }]
})

template.register({
  name: 'invite',
  compact: false,
  fields: [{
    name: 'id',
    type: 'buffer',
    required: true
  }, {
    name: 'invite',
    type: 'buffer',
    required: true
  }, {
    name: 'publicKey',
    type: 'buffer',
    required: true
  }, {
    name: 'expires',
    type: 'int',
    required: true
  }
  ]
})

template.register({
  name: 'del-invite',
  compact: false,
  fields: [{
    name: 'id',
    type: 'buffer',
    required: true
  }]
})

Hyperschema.toDisk(autonote)

// DATABASE BUILDER
const dbTemplate = HyperdbBuilder.from('./spec/schema', './spec/db')
const noteDB = dbTemplate.namespace('autonote')


// Define collections
noteDB.collections.register({
  name: 'blocks',
  schema: '@autonote/block',
  key: ['id']
})

noteDB.collections.register({
  name: 'operations',
  schema: '@autonote/operation',
  key: ['id']
})

// Define indexes
noteDB.indexes.register({
  name: 'blocks-by-page',
  collection: '@autonote/blocks',
  key: ['pageId']
})

noteDB.indexes.register({
  name: 'blocks-by-parent',
  collection: '@autonote/blocks',
  key: ['parentId']
})

noteDB.indexes.register({
  name: 'operations-by-block',
  collection: '@autonote/operations',
  key: ['blockId']
})

noteDB.collections.register({
  name: 'profile',
  schema: '@autonote/profile',
  key: ['userId']
})

noteDB.collections.register({
  name: 'groups',
  schema: '@autonote/group',
  key: ['id']
})

noteDB.collections.register({
  name: 'pages',
  schema: '@autonote/page',
  key: ['id']
})

noteDB.collections.register({
  name: 'filerefs',
  schema: '@autonote/fileref',
  key: ['id']
})

noteDB.collections.register({
  name: 'invite',
  schema: '@autonote/invite',
  key: ['id']
})

noteDB.collections.register({
  name: 'writer',
  schema: '@autonote/writer',
  key: ['key']
})

noteDB.collections.register({
  name: 'delete',
  schema: '@autonote/delete',
  key: ['id']
})

noteDB.collections.register({
  name: 'del-invite',
  schema: '@autonote/del-invite',
  key: ['id']
})

HyperdbBuilder.toDisk(dbTemplate)

// HYPERDISPATCH COMMANDS
const hyperdispatch = Hyperdispatch.from('./spec/schema', './spec/hyperdispatch')
const namespace = hyperdispatch.namespace('autonote')

// Writer management
namespace.register({
  name: 'remove-writer',
  requestType: '@autonote/writer'
})
namespace.register({
  name: 'add-writer',
  requestType: '@autonote/writer'
})

// Profile operations
namespace.register({
  name: 'update-profile',
  requestType: '@autonote/profile'
})

// Group operations
namespace.register({
  name: 'create-group',
  requestType: '@autonote/group'
})
namespace.register({
  name: 'update-group',
  requestType: '@autonote/group'
})
namespace.register({
  name: 'delete-group',
  requestType: '@autonote/delete'
})

// Page operations
namespace.register({
  name: 'create-page',
  requestType: '@autonote/page'
})
namespace.register({
  name: 'update-page',
  requestType: '@autonote/page'
})
namespace.register({
  name: 'delete-page',
  requestType: '@autonote/delete'
})

// File reference operations
namespace.register({
  name: 'add-fileref',
  requestType: '@autonote/fileref'
})
namespace.register({
  name: 'delete-fileref',
  requestType: '@autonote/delete'
})

// Invite operations
namespace.register({
  name: 'add-invite',
  requestType: '@autonote/invite'
})
namespace.register({
  name: 'del-invite',
  requestType: '@autonote/invite'
})


namespace.register({
  name: 'create-block',
  requestType: '@autonote/block'
})

namespace.register({
  name: 'update-block',
  requestType: '@autonote/block'
})

namespace.register({
  name: 'delete-block',
  requestType: '@autonote/block'
})

namespace.register({
  name: 'apply-operation',
  requestType: '@autonote/operation'
})

Hyperdispatch.toDisk(hyperdispatch)
