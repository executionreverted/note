// backend/src/blocks.js
const crypto = require('crypto')

function generateId() {
  return crypto.randomBytes(16).toString('hex')
}

// Available block types and their schemas
const BLOCK_TYPES = {
  paragraph: { schema: {} },
  heading: { schema: { level: 'number' } },
  list: { schema: { ordered: 'boolean', indent: 'number' } },
  code: { schema: { language: 'string' } },
  image: { schema: { src: 'string', alt: 'string', width: 'number', height: 'number' } },
  divider: { schema: {} }
}

// Operation transforms (Operational Transform implementation)
const OperationTransform = {
  // Transform operation against another operation
  transform(op1, op2) {
    // Both insert operations
    if (op1.type === 'insert' && op2.type === 'insert') {
      if (op2.position <= op1.position) {
        return { ...op1, position: op1.position + op2.value.length }
      }
      return op1
    }

    // Insert against delete
    if (op1.type === 'insert' && op2.type === 'delete') {
      if (op2.position < op1.position) {
        return { ...op1, position: Math.max(op2.position, op1.position - op2.length) }
      }
      return op1
    }

    // Delete against insert
    if (op1.type === 'delete' && op2.type === 'insert') {
      if (op2.position <= op1.position) {
        return { ...op1, position: op1.position + op2.value.length }
      }
      return op1
    }

    // Both delete operations
    if (op1.type === 'delete' && op2.type === 'delete') {
      if (op2.position >= op1.position + op1.length) {
        return op1
      }
      if (op2.position + op2.length <= op1.position) {
        return { ...op1, position: op1.position - op2.length }
      }
      // Overlapping deletes
      const newPos = Math.min(op1.position, op2.position)
      const end1 = op1.position + op1.length
      const end2 = op2.position + op2.length
      const newEnd = Math.max(end1, end2)
      const overlapStart = Math.max(op1.position, op2.position)
      const overlapEnd = Math.min(end1, end2)
      const overlapLength = Math.max(0, overlapEnd - overlapStart)
      return {
        ...op1,
        position: newPos,
        length: (newEnd - newPos) - overlapLength
      }
    }

    return op1
  },

  // Apply operation to content
  apply(content, op) {
    if (!content) content = ''

    if (op.type === 'insert') {
      return content.slice(0, op.position) + op.value + content.slice(op.position)
    }

    if (op.type === 'delete') {
      return content.slice(0, op.position) + content.slice(op.position + op.length)
    }

    if (op.type === 'update') {
      return op.value // Full replacement
    }

    return content
  },

  // Compose multiple operations into one
  compose(op1, op2) {
    if (op1.type === 'insert' && op2.type === 'insert' &&
      op2.position === op1.position + op1.value.length) {
      return {
        ...op1,
        value: op1.value + op2.value
      }
    }

    if (op1.type === 'delete' && op2.type === 'delete' &&
      op2.position === op1.position) {
      return {
        ...op1,
        length: op1.length + op2.length
      }
    }

    return [op1, op2] // Can't compose, return both
  }
}

// Block validator
function validateBlock(block) {
  if (!block.id || !block.pageId || !block.type) {
    return false
  }

  if (!BLOCK_TYPES[block.type]) {
    return false
  }

  if (block.metadata) {
    try {
      const metadata = JSON.parse(block.metadata)
      const schema = BLOCK_TYPES[block.type].schema

      for (const [key, type] of Object.entries(schema)) {
        if (metadata[key] !== undefined && typeof metadata[key] !== type) {
          return false
        }
      }
    } catch (e) {
      return false
    }
  }

  return true
}

module.exports = {
  BLOCK_TYPES,
  OperationTransform,
  validateBlock,
  generateId
}
