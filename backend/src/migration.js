// backend/src/migration.js
const { generateId } = require('./blocks');

/**
 * Migrates existing pages to the block-based architecture
 */
class MigrationManager {
  constructor(autonote) {
    this.autonote = autonote;
  }

  /**
   * Migrates all pages in the system to blocks
   */
  async migrateAllPages() {
    const pages = await this.autonote.listPages();
    const results = [];

    for (const page of pages) {
      try {
        const blocks = await this.autonote.migratePageToBlocks(page.id);
        results.push({
          pageId: page.id,
          title: page.title,
          success: true,
          blockCount: blocks.length
        });
      } catch (error) {
        results.push({
          pageId: page.id,
          title: page.title,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Creates a block backup of a page without replacing the original
   */
  async backupPageAsBlocks(pageId) {
    const page = await this.autonote.getPage(pageId);
    if (!page) throw new Error('Page not found');

    // Create backup page
    const backupPage = await this.autonote.createPage(
      `${page.title} (Block Backup)`,
      '',
      page.groupId,
      { tags: page.tags, starred: page.starred }
    );

    // Convert to blocks on the backup page
    const blockManager = await this.autonote.getBlockManager();

    // Pass the page to migratePageToBlocks directly
    const blocks = await blockManager.migratePageToBlocks({
      ...page,
      id: backupPage.id
    });

    return {
      originalPageId: pageId,
      backupPageId: backupPage.id,
      blockCount: blocks.length
    };
  }

  /**
   * Checks if a page has been migrated to blocks
   */
  async isPageMigrated(pageId) {
    const blockManager = await this.autonote.getBlockManager();
    const blocks = await blockManager.getBlocksByPage(pageId);
    return blocks.length > 0;
  }
}

module.exports = MigrationManager;
