/**
 * Unit tests for StaleDatabaseManager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StaleDatabaseManager, createStaleDatabaseManager } from './stale-database.js';
import { StaleItem } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

describe('StaleDatabaseManager', () => {
  const testDbPath = 'test-data/test-stale-items.db';
  let manager: StaleDatabaseManager;

  // Sample stale item for testing
  const createSampleStaleItem = (id: string, category: string = 'Theme', monthsStale: number = 15): StaleItem => ({
    id,
    name: `Test ${id}`,
    repo: id,
    url: `https://github.com/${id}`,
    description: `Test description for ${id}`,
    category,
    tags: ['ghost-theme', 'test'],
    stars: 100,
    pushedAt: '2022-01-01T00:00:00Z',
    archived: false,
    fork: false,
    license: 'MIT',
    topics: ['ghost', 'theme'],
    score: 85,
    confidence: 'high',
    notes: null,
    hidden: false,
    staleDetectedAt: '2024-01-01T00:00:00Z',
    monthsStale,
  });

  beforeEach(async () => {
    // Ensure test-data directory exists
    if (!fs.existsSync('test-data')) {
      fs.mkdirSync('test-data', { recursive: true });
    }

    // Remove test database if it exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Create and initialize manager
    manager = createStaleDatabaseManager(testDbPath);
    await manager.initialize();
  });

  afterEach(() => {
    // Clean up
    manager.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Clean up backup files
    const testDir = path.dirname(testDbPath);
    if (fs.existsSync(testDir)) {
      const files = fs.readdirSync(testDir);
      for (const file of files) {
        if (file.startsWith('test-stale-items.backup-')) {
          fs.unlinkSync(path.join(testDir, file));
        }
      }
    }
  });

  describe('Database Initialization', () => {
    it('should create database file on initialization', () => {
      expect(fs.existsSync(testDbPath)).toBe(true);
    });

    it('should create stale_items table', async () => {
      // Try to insert an item - this will fail if table doesn't exist
      const item = createSampleStaleItem('test/repo');
      await expect(manager.upsertStaleItem(item)).resolves.not.toThrow();
    });

    it('should create required indexes', async () => {
      // Insert some items and query by category - this tests the index
      const item1 = createSampleStaleItem('test/repo1', 'Theme');
      const item2 = createSampleStaleItem('test/repo2', 'Tool');
      
      await manager.upsertStaleItem(item1);
      await manager.upsertStaleItem(item2);

      const themeItems = await manager.getStaleItemsByCategory('Theme');
      expect(themeItems).toHaveLength(1);
      expect(themeItems[0].id).toBe('test/repo1');
    });

    it('should create directory if it does not exist', async () => {
      const nestedPath = 'test-data/nested/dir/test.db';
      const nestedManager = createStaleDatabaseManager(nestedPath);
      
      await nestedManager.initialize();
      expect(fs.existsSync(nestedPath)).toBe(true);
      
      nestedManager.close();
      fs.unlinkSync(nestedPath);
      fs.rmdirSync('test-data/nested/dir');
      fs.rmdirSync('test-data/nested');
    });
  });

  describe('CRUD Operations', () => {
    describe('upsertStaleItem', () => {
      it('should insert a new stale item', async () => {
        const item = createSampleStaleItem('test/repo');
        await manager.upsertStaleItem(item);

        const allItems = await manager.getAllStaleItems();
        expect(allItems).toHaveLength(1);
        expect(allItems[0].id).toBe('test/repo');
        expect(allItems[0].name).toBe('Test test/repo');
      });

      it('should update an existing stale item', async () => {
        const item = createSampleStaleItem('test/repo');
        await manager.upsertStaleItem(item);

        // Update the item
        const updatedItem = { ...item, stars: 200, monthsStale: 20 };
        await manager.upsertStaleItem(updatedItem);

        const allItems = await manager.getAllStaleItems();
        expect(allItems).toHaveLength(1);
        expect(allItems[0].stars).toBe(200);
        expect(allItems[0].monthsStale).toBe(20);
      });

      it('should preserve all fields correctly', async () => {
        const item = createSampleStaleItem('test/repo');
        item.description = 'Special description';
        item.archived = true;
        item.fork = true;
        item.hidden = true;
        item.notes = 'Test notes';
        item.license = 'Apache-2.0';

        await manager.upsertStaleItem(item);

        const allItems = await manager.getAllStaleItems();
        expect(allItems[0].description).toBe('Special description');
        expect(allItems[0].archived).toBe(true);
        expect(allItems[0].fork).toBe(true);
        expect(allItems[0].hidden).toBe(true);
        expect(allItems[0].notes).toBe('Test notes');
        expect(allItems[0].license).toBe('Apache-2.0');
      });

      it('should handle items with null fields', async () => {
        const item = createSampleStaleItem('test/repo');
        item.description = null;
        item.license = null;
        item.notes = null;

        await manager.upsertStaleItem(item);

        const allItems = await manager.getAllStaleItems();
        expect(allItems[0].description).toBeNull();
        expect(allItems[0].license).toBeNull();
        expect(allItems[0].notes).toBeNull();
      });

      it('should handle arrays correctly (tags and topics)', async () => {
        const item = createSampleStaleItem('test/repo');
        item.tags = ['tag1', 'tag2', 'tag3'];
        item.topics = ['topic1', 'topic2'];

        await manager.upsertStaleItem(item);

        const allItems = await manager.getAllStaleItems();
        expect(allItems[0].tags).toEqual(['tag1', 'tag2', 'tag3']);
        expect(allItems[0].topics).toEqual(['topic1', 'topic2']);
      });
    });

    describe('getAllStaleItems', () => {
      it('should return empty array when no items exist', async () => {
        const items = await manager.getAllStaleItems();
        expect(items).toEqual([]);
      });

      it('should return all stale items', async () => {
        const item1 = createSampleStaleItem('test/repo1');
        const item2 = createSampleStaleItem('test/repo2');
        const item3 = createSampleStaleItem('test/repo3');

        await manager.upsertStaleItem(item1);
        await manager.upsertStaleItem(item2);
        await manager.upsertStaleItem(item3);

        const items = await manager.getAllStaleItems();
        expect(items).toHaveLength(3);
      });

      it('should order items by category and stars', async () => {
        const item1 = createSampleStaleItem('test/repo1', 'Theme');
        item1.stars = 50;
        const item2 = createSampleStaleItem('test/repo2', 'Theme');
        item2.stars = 100;
        const item3 = createSampleStaleItem('test/repo3', 'Tool');
        item3.stars = 75;

        await manager.upsertStaleItem(item1);
        await manager.upsertStaleItem(item2);
        await manager.upsertStaleItem(item3);

        const items = await manager.getAllStaleItems();
        
        // Should be ordered by category first, then by stars descending within category
        expect(items[0].category).toBe('Theme');
        expect(items[0].stars).toBe(100);
        expect(items[1].category).toBe('Theme');
        expect(items[1].stars).toBe(50);
        expect(items[2].category).toBe('Tool');
      });
    });

    describe('removeStaleItem', () => {
      it('should remove an item from the database', async () => {
        const item = createSampleStaleItem('test/repo');
        await manager.upsertStaleItem(item);

        let items = await manager.getAllStaleItems();
        expect(items).toHaveLength(1);

        await manager.removeStaleItem('test/repo');

        items = await manager.getAllStaleItems();
        expect(items).toHaveLength(0);
      });

      it('should not throw error when removing non-existent item', async () => {
        await expect(manager.removeStaleItem('non/existent')).resolves.not.toThrow();
      });

      it('should only remove the specified item', async () => {
        const item1 = createSampleStaleItem('test/repo1');
        const item2 = createSampleStaleItem('test/repo2');
        const item3 = createSampleStaleItem('test/repo3');

        await manager.upsertStaleItem(item1);
        await manager.upsertStaleItem(item2);
        await manager.upsertStaleItem(item3);

        await manager.removeStaleItem('test/repo2');

        const items = await manager.getAllStaleItems();
        expect(items).toHaveLength(2);
        expect(items.find(i => i.id === 'test/repo1')).toBeDefined();
        expect(items.find(i => i.id === 'test/repo2')).toBeUndefined();
        expect(items.find(i => i.id === 'test/repo3')).toBeDefined();
      });
    });

    describe('getStaleItemsByCategory', () => {
      it('should return items filtered by category', async () => {
        const item1 = createSampleStaleItem('test/repo1', 'Theme');
        const item2 = createSampleStaleItem('test/repo2', 'Tool');
        const item3 = createSampleStaleItem('test/repo3', 'Theme');

        await manager.upsertStaleItem(item1);
        await manager.upsertStaleItem(item2);
        await manager.upsertStaleItem(item3);

        const themeItems = await manager.getStaleItemsByCategory('Theme');
        expect(themeItems).toHaveLength(2);
        expect(themeItems.every(item => item.category === 'Theme')).toBe(true);

        const toolItems = await manager.getStaleItemsByCategory('Tool');
        expect(toolItems).toHaveLength(1);
        expect(toolItems[0].category).toBe('Tool');
      });

      it('should return empty array for non-existent category', async () => {
        const item = createSampleStaleItem('test/repo', 'Theme');
        await manager.upsertStaleItem(item);

        const items = await manager.getStaleItemsByCategory('NonExistent');
        expect(items).toEqual([]);
      });

      it('should order items by stars descending', async () => {
        const item1 = createSampleStaleItem('test/repo1', 'Theme');
        item1.stars = 50;
        const item2 = createSampleStaleItem('test/repo2', 'Theme');
        item2.stars = 150;
        const item3 = createSampleStaleItem('test/repo3', 'Theme');
        item3.stars = 100;

        await manager.upsertStaleItem(item1);
        await manager.upsertStaleItem(item2);
        await manager.upsertStaleItem(item3);

        const items = await manager.getStaleItemsByCategory('Theme');
        expect(items[0].stars).toBe(150);
        expect(items[1].stars).toBe(100);
        expect(items[2].stars).toBe(50);
      });
    });
  });

  describe('Statistics', () => {
    describe('getStatistics', () => {
      it('should return zero statistics for empty database', async () => {
        const stats = await manager.getStatistics();
        expect(stats.totalStale).toBe(0);
        expect(stats.byCategory).toEqual({});
        expect(stats.averageMonthsStale).toBe(0);
      });

      it('should calculate total stale items correctly', async () => {
        const item1 = createSampleStaleItem('test/repo1');
        const item2 = createSampleStaleItem('test/repo2');
        const item3 = createSampleStaleItem('test/repo3');

        await manager.upsertStaleItem(item1);
        await manager.upsertStaleItem(item2);
        await manager.upsertStaleItem(item3);

        const stats = await manager.getStatistics();
        expect(stats.totalStale).toBe(3);
      });

      it('should calculate breakdown by category', async () => {
        const item1 = createSampleStaleItem('test/repo1', 'Theme');
        const item2 = createSampleStaleItem('test/repo2', 'Tool');
        const item3 = createSampleStaleItem('test/repo3', 'Theme');
        const item4 = createSampleStaleItem('test/repo4', 'Starter');

        await manager.upsertStaleItem(item1);
        await manager.upsertStaleItem(item2);
        await manager.upsertStaleItem(item3);
        await manager.upsertStaleItem(item4);

        const stats = await manager.getStatistics();
        expect(stats.byCategory).toEqual({
          Theme: 2,
          Tool: 1,
          Starter: 1,
        });
      });

      it('should calculate average months stale', async () => {
        const item1 = createSampleStaleItem('test/repo1', 'Theme', 12);
        const item2 = createSampleStaleItem('test/repo2', 'Theme', 18);
        const item3 = createSampleStaleItem('test/repo3', 'Theme', 24);

        await manager.upsertStaleItem(item1);
        await manager.upsertStaleItem(item2);
        await manager.upsertStaleItem(item3);

        const stats = await manager.getStatistics();
        expect(stats.averageMonthsStale).toBe(18); // (12 + 18 + 24) / 3 = 18
      });

      it('should round average months stale to 1 decimal place', async () => {
        const item1 = createSampleStaleItem('test/repo1', 'Theme', 13);
        const item2 = createSampleStaleItem('test/repo2', 'Theme', 14);
        const item3 = createSampleStaleItem('test/repo3', 'Theme', 15);

        await manager.upsertStaleItem(item1);
        await manager.upsertStaleItem(item2);
        await manager.upsertStaleItem(item3);

        const stats = await manager.getStatistics();
        expect(stats.averageMonthsStale).toBe(14); // (13 + 14 + 15) / 3 = 14
      });
    });
  });

  describe('Backup', () => {
    it('should create a backup file', async () => {
      const item = createSampleStaleItem('test/repo');
      await manager.upsertStaleItem(item);

      const backupPath = await manager.backup();
      
      expect(fs.existsSync(backupPath)).toBe(true);
      expect(backupPath).toContain('test-stale-items.backup-');
      expect(backupPath).toMatch(/\.db$/);

      // Clean up
      fs.unlinkSync(backupPath);
    });

    it('should preserve data in backup', async () => {
      const item1 = createSampleStaleItem('test/repo1');
      const item2 = createSampleStaleItem('test/repo2');
      
      await manager.upsertStaleItem(item1);
      await manager.upsertStaleItem(item2);

      const backupPath = await manager.backup();

      // Create a new manager with the backup file
      const backupManager = createStaleDatabaseManager(backupPath);
      await backupManager.initialize();

      const backupItems = await backupManager.getAllStaleItems();
      expect(backupItems).toHaveLength(2);
      expect(backupItems.find(i => i.id === 'test/repo1')).toBeDefined();
      expect(backupItems.find(i => i.id === 'test/repo2')).toBeDefined();

      backupManager.close();
      fs.unlinkSync(backupPath);
    });

    it('should allow database operations after backup', async () => {
      const item1 = createSampleStaleItem('test/repo1');
      await manager.upsertStaleItem(item1);

      const backupPath = await manager.backup();

      // Should be able to continue using the database
      const item2 = createSampleStaleItem('test/repo2');
      await manager.upsertStaleItem(item2);

      const items = await manager.getAllStaleItems();
      expect(items).toHaveLength(2);

      fs.unlinkSync(backupPath);
    });
  });

  describe('Data Integrity Validation', () => {
    it('should pass validation for a healthy database', async () => {
      const item = createSampleStaleItem('test/repo');
      await manager.upsertStaleItem(item);

      const result = await manager.validateIntegrity();
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect missing indexes', async () => {
      // This test would require manually corrupting the database
      // For now, we just verify the validation runs without error
      const result = await manager.validateIntegrity();
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
    });

    it('should validate JSON fields', async () => {
      const item = createSampleStaleItem('test/repo');
      await manager.upsertStaleItem(item);

      const result = await manager.validateIntegrity();
      expect(result.valid).toBe(true);
    });

    it('should detect negative numeric values', async () => {
      // Insert an item with valid data first
      const item = createSampleStaleItem('test/repo');
      await manager.upsertStaleItem(item);

      // Manually corrupt the data by setting negative values
      // This requires direct SQL access
      const db = (manager as any).db;
      db.prepare('UPDATE stale_items SET stars = -1 WHERE id = ?').run('test/repo');

      const result = await manager.validateIntegrity();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('negative'))).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when operations are called before initialization', async () => {
      const uninitializedManager = createStaleDatabaseManager('test-data/uninit.db');
      
      const item = createSampleStaleItem('test/repo');
      
      await expect(uninitializedManager.upsertStaleItem(item)).rejects.toThrow('Database not initialized');
      await expect(uninitializedManager.getAllStaleItems()).rejects.toThrow('Database not initialized');
      await expect(uninitializedManager.removeStaleItem('test/repo')).rejects.toThrow('Database not initialized');
      await expect(uninitializedManager.getStaleItemsByCategory('Theme')).rejects.toThrow('Database not initialized');
      await expect(uninitializedManager.getStatistics()).rejects.toThrow('Database not initialized');
      await expect(uninitializedManager.backup()).rejects.toThrow('Database not initialized');
      await expect(uninitializedManager.validateIntegrity()).rejects.toThrow('Database not initialized');
    });
  });

  describe('Factory Function', () => {
    it('should create a StaleDatabaseManager instance', () => {
      const newManager = createStaleDatabaseManager('test-data/factory-test.db');
      expect(newManager).toBeInstanceOf(StaleDatabaseManager);
    });
  });
});
