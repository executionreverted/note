// backend/src/blockManager.js
const { dispatch } = require('./spec/hyperdispatch')
const { BLOCK_TYPES, OperationTransform, validateBlock, generateId } = require('./blocks')

class BlockManager {
  constructor(autonote) {
    this.autonote = autonote
    this.base = autonote.base
    this.pendingOperations = new Map() // blockId -> operations[]
  }

  async createBlock(pageId, type, content = '', options = {}) {
    const now = Date.now()
    const authorId = this.autonote.writerKey.toString('hex').slice(0, 8)

    // Get position (default to end)
    let position = 0
    if (options.position !== undefined) {
      position = options.position
    } else {
      const existingBlocks = await this.getBlocksByPage(pageId)
      position = existingBlocks.length
    }

    // Create metadata
    let metadata = null
    if (options.metadata) {
      metadata = JSON.stringify(options.metadata)
    }

    const block = {
      id: generateId(),
      pageId,
      parentId: options.parentId || null,
      type,
      content: content || '',
      metadata,
      position,
      createdAt: now,
      updatedAt: now,
      createdBy: authorId,
      updatedBy: authorId,
      version: 1
    }

    if (!validateBlock(block)) {
      throw new Error('Invalid block data')
    }

    await this.base.append(dispatch('@autonote/create-block', block))
    return { ...block, metadata: metadata ? JSON.parse(metadata) : null }
  }

  async updateBlock(id, updates) {
    const block = await this.getBlock(id)
    if (!block) {
      throw new Error('Block not found')
    }

    const now = Date.now()
    const authorId = this.autonote.writerKey.toString('hex').slice(0, 8)

    // Create updated block
    const updatedBlock = {
      ...block,
      ...updates,
      updatedAt: now,
      updatedBy: authorId,
      version: block.version + 1
    }

    // Handle metadata updates
    if (updates.metadata) {
      updatedBlock.metadata = JSON.stringify(updates.metadata)
    }

    if (!validateBlock(updatedBlock)) {
      throw new Error('Invalid block data')
    }

    await this.base.append(dispatch('@autonote/update-block', updatedBlock))
    return { ...updatedBlock, metadata: updatedBlock.metadata ? JSON.parse(updatedBlock.metadata) : null }
  }

  async deleteBlock(id) {
    const block = await this.getBlock(id)
    if (!block) {
      throw new Error('Block not found')
    }

    // Mark block as deleted by setting special type
    const updatedBlock = {
      ...block,
      type: '_deleted',
      updatedAt: Date.now(),
      updatedBy: this.autonote.writerKey.toString('hex').slice(0, 8),
      version: block.version + 1
    }

    await this.base.append(dispatch('@autonote/update-block', updatedBlock))
    return true
  }

  async getBlock(id) {
    const block = await this.base.view.get('@autonote/blocks', { id })
    if (!block || block.type === '_deleted') return null

    return {
      ...block,
      metadata: block.metadata ? JSON.parse(block.metadata) : null
    }
  }

  async getBlocksByPage(pageId) {
    const blocks = await this.base.view.find('@autonote/blocks-by-page', { pageId })
    const results = await blocks.toArray()

    return results
      .filter(block => block.type !== '_deleted')
      .map(block => ({
        ...block,
        metadata: block.metadata ? JSON.parse(block.metadata) : null
      }))
      .sort((a, b) => a.position - b.position)
  }

  async applyOperation(blockId, operation) {
    const block = await this.getBlock(blockId)
    if (!block) {
      throw new Error('Block not found')
    }

    // Create operation record
    const now = Date.now()
    const authorId = this.autonote.writerKey.toString('hex').slice(0, 8)

    const op = {
      id: generateId(),
      blockId,
      type: operation.type,
      position: operation.position,
      length: operation.length,
      value: operation.value,
      timestamp: now,
      author: authorId,
      baseVersion: block.version
    }

    // Check for concurrent operations
    const pendingOps = this.pendingOperations.get(blockId) || []
    let transformedOp = { ...op }

    // Transform against pending operations
    for (const pendingOp of pendingOps) {
      transformedOp = OperationTransform.transform(transformedOp, pendingOp)
    }

    // Add to pending operations
    pendingOps.push(transformedOp)
    this.pendingOperations.set(blockId, pendingOps)

    // Apply to content
    const newContent = OperationTransform.apply(block.content, transformedOp)

    // Update block
    const updatedBlock = await this.updateBlock(blockId, {
      content: newContent,
      version: block.version + 1
    })

    // Record operation
    await this.base.append(dispatch('@autonote/apply-operation', op))

    // Remove from pending after confirmed
    this.pendingOperations.set(blockId, pendingOps.filter(p => p.id !== op.id))

    return {
      operation: op,
      block: updatedBlock
    }
  }

  // Move blocks (for drag and drop)
  async moveBlock(id, newPosition, newParentId = null) {
    const block = await this.getBlock(id)
    if (!block) {
      throw new Error('Block not found')
    }

    // Update position and parent
    return await this.updateBlock(id, {
      position: newPosition,
      parentId: newParentId !== undefined ? newParentId : block.parentId
    })
  }

  // Batch operations for efficiency
  async batchCreateBlocks(pageId, blocks) {
    const createdBlocks = []
    for (const blockData of blocks) {
      const block = await this.createBlock(
        pageId,
        blockData.type,
        blockData.content,
        {
          position: blockData.position,
          parentId: blockData.parentId,
          metadata: blockData.metadata
        }
      )
      createdBlocks.push(block)
    }
    return createdBlocks
  }

  // Handle migrations from old document-based system
  async migratePageToBlocks(page) {
    if (!page || !page.content) return []

    // Simple migration: convert to paragraph blocks
    const lines = page.content.split('\n')
    const blocks = []

    let currentBlock = { type: 'paragraph', content: '', position: 0 }
    let position = 0

    for (const line of lines) {
      // Detect headings
      if (line.startsWith('# ')) {
        blocks.push(currentBlock)
        currentBlock = {
          type: 'heading',
          content: line.substring(2),
          metadata: { level: 1 },
          position: ++position
        }
        continue
      }

      if (line.startsWith('## ')) {
        blocks.push(currentBlock)
        currentBlock = {
          type: 'heading',
          content: line.substring(3),
          metadata: { level: 2 },
          position: ++position
        }
        continue
      }

      if (line.startsWith('### ')) {
        blocks.push(currentBlock)
        currentBlock = {
          type: 'heading',
          content: line.substring(4),
          metadata: { level: 3 },
          position: ++position
        }
        continue
      }

      // Detect list items
      if (line.startsWith('- ') || line.startsWith('* ')) {
        blocks.push(currentBlock)
        currentBlock = {
          type: 'list',
          content: line.substring(2),
          metadata: { ordered: false, indent: 0 },
          position: ++position
        }
        continue
      }

      if (/^\d+\.\s/.test(line)) {
        blocks.push(currentBlock)
        currentBlock = {
          type: 'list',
          content: line.replace(/^\d+\.\s/, ''),
          metadata: { ordered: true, indent: 0 },
          position: ++position
        }
        continue
      }

      // Empty line - start new paragraph
      if (line.trim() === '') {
        blocks.push(currentBlock)
        currentBlock = { type: 'paragraph', content: '', position: ++position }
        continue
      }

      // Append to current block if it's not empty
      if (currentBlock.content) {
        currentBlock.content += '\n' + line
      } else {
        currentBlock.content = line
      }
    }

    // Add the last block
    if (currentBlock.content) {
      blocks.push(currentBlock)
    }

    // Remove empty first block if present
    if (blocks.length > 0 && !blocks[0].content) {
      blocks.shift()
    }

    // Create blocks in database
    return await this.batchCreateBlocks(page.id, blocks)
  }
}

module.exports = BlockManager
