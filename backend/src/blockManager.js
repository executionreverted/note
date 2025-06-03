// backend/src/blockManager.js
const crypto = require('crypto')
const { dispatch } = require('./spec/hyperdispatch')

function nanoid() {
  return crypto.randomBytes(16).toString('hex')
}

class BlockManager {
  constructor(autonote) {
    this.autonote = autonote
    this.operationalTransform = new OperationalTransform()
  }

  async createBlock(pageId, type, content = '', options = {}) {
    const now = Date.now()
    const block = {
      id: nanoid(),
      pageId,
      parentId: options.parentId || null,
      type,
      content,
      metadata: JSON.stringify(options.metadata || {}),
      position: options.position || 0,
      createdAt: now,
      updatedAt: now,
      createdBy: this.autonote.writerKey?.toString('hex').slice(0, 8) || 'unknown',
      updatedBy: this.autonote.writerKey?.toString('hex').slice(0, 8) || 'unknown',
      version: 1
    }

    await this.autonote.base.append(dispatch('@autonote/create-block', block))
    return { ...block, metadata: JSON.parse(block.metadata) }
  }

  async updateBlock(id, updates) {
    const existing = await this.getBlock(id)
    if (!existing) throw new Error('Block not found')

    const now = Date.now()
    const block = {
      ...existing,
      ...updates,
      id,
      metadata: JSON.stringify(updates.metadata || existing.metadata || {}),
      updatedAt: now,
      updatedBy: this.autonote.writerKey?.toString('hex').slice(0, 8) || 'unknown',
      version: existing.version + 1
    }

    await this.autonote.base.append(dispatch('@autonote/update-block', block))
    return { ...block, metadata: JSON.parse(block.metadata) }
  }

  async deleteBlock(id) {
    const existing = await this.getBlock(id)
    if (!existing) throw new Error('Block not found')

    // Use update-block instead of delete-block to mark as deleted
    const now = Date.now()
    const deletedBlock = {
      ...existing,
      metadata: JSON.stringify(existing.metadata),
      type: '_deleted',
      updatedAt: now,
      updatedBy: this.autonote.writerKey?.toString('hex').slice(0, 8) || 'unknown',
      version: existing.version + 1
    }

    console.log(deletedBlock)

    await this.autonote.base.append(dispatch('@autonote/update-block', deletedBlock))
  }

  async getBlock(id) {
    const block = await this.autonote.base.view.get('@autonote/blocks', { id })
    if (!block || block.type === '_deleted') return null

    return {
      ...block,
      metadata: JSON.parse(block.metadata || '{}')
    }
  }

  async getBlocksByPage(pageId) {
    const blocks = await (await this.autonote.base.view.find('@autonote/blocks', { pageId })).toArray()

    return blocks
      .filter(block => block.type !== '_deleted')
      .map(block => ({
        ...block,
        metadata: JSON.parse(block.metadata || '{}')
      }))
      .sort((a, b) => a.position - b.position)
  }

  async moveBlock(id, newPosition, newParentId = null) {
    const block = await this.getBlock(id)
    if (!block) throw new Error('Block not found')

    return await this.updateBlock(id, {
      position: newPosition,
      parentId: newParentId
    })
  }

  async applyOperation(blockId, operation) {
    const block = await this.getBlock(blockId)
    if (!block) throw new Error('Block not found')

    // Store the operation
    const opRecord = {
      id: nanoid(),
      blockId,
      type: operation.type,
      position: operation.position,
      length: operation.length,
      value: operation.value,
      timestamp: Date.now(),
      author: this.autonote.writerKey?.toString('hex').slice(0, 8) || 'unknown',
      baseVersion: block.version
    }

    await this.autonote.base.append(dispatch('@autonote/apply-operation', opRecord))

    // Apply the operation to the block content
    let newContent = block.content

    switch (operation.type) {
      case 'insert':
        newContent = newContent.slice(0, operation.position) +
          operation.value +
          newContent.slice(operation.position)
        break
      case 'delete':
        newContent = newContent.slice(0, operation.position) +
          newContent.slice(operation.position + operation.length)
        break
      case 'update':
        newContent = operation.value
        break
    }

    const updatedBlock = await this.updateBlock(blockId, { content: newContent })

    return {
      operation: opRecord,
      block: updatedBlock
    }
  }

  async migratePageToBlocks(page) {
    const content = page.content || ''
    const lines = content.split('\n').filter(line => line.trim())

    if (lines.length === 0) {
      // Create an empty paragraph
      return [await this.createBlock(page.id, 'paragraph', '', { position: 0 })]
    }

    const blocks = []
    let position = 0

    for (const line of lines) {
      const trimmed = line.trim()

      if (trimmed.startsWith('# ')) {
        blocks.push(await this.createBlock(page.id, 'heading', trimmed.slice(2), {
          position: position++,
          metadata: { level: 1 }
        }))
      } else if (trimmed.startsWith('## ')) {
        blocks.push(await this.createBlock(page.id, 'heading', trimmed.slice(3), {
          position: position++,
          metadata: { level: 2 }
        }))
      } else if (trimmed.startsWith('### ')) {
        blocks.push(await this.createBlock(page.id, 'heading', trimmed.slice(4), {
          position: position++,
          metadata: { level: 3 }
        }))
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        blocks.push(await this.createBlock(page.id, 'list', trimmed.slice(2), {
          position: position++,
          metadata: { ordered: false, indent: 0 }
        }))
      } else if (/^\d+\.\s/.test(trimmed)) {
        blocks.push(await this.createBlock(page.id, 'list', trimmed.replace(/^\d+\.\s/, ''), {
          position: position++,
          metadata: { ordered: true, indent: 0 }
        }))
      } else if (trimmed.startsWith('```')) {
        blocks.push(await this.createBlock(page.id, 'code', '', {
          position: position++,
          metadata: { language: trimmed.slice(3) }
        }))
      } else if (trimmed === '---') {
        blocks.push(await this.createBlock(page.id, 'divider', '', {
          position: position++
        }))
      } else if (trimmed.length > 0) {
        blocks.push(await this.createBlock(page.id, 'paragraph', trimmed, {
          position: position++
        }))
      }
    }

    return blocks
  }
}

// Simple operational transform for text operations
class OperationalTransform {
  transform(op1, op2) {
    // Basic OT implementation
    if (op1.type === 'insert' && op2.type === 'insert') {
      if (op1.position <= op2.position) {
        return { ...op2, position: op2.position + op1.value.length }
      } else {
        return op2
      }
    }

    if (op1.type === 'delete' && op2.type === 'insert') {
      if (op1.position < op2.position) {
        return { ...op2, position: Math.max(op1.position, op2.position - op1.length) }
      } else {
        return op2
      }
    }

    // Add more transformation rules as needed
    return op2
  }
}

module.exports = BlockManager
