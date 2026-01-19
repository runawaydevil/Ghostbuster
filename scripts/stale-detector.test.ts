/**
 * Unit tests for StalenessDetector
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StalenessDetector, StalenessConfig, createStalenessDetector } from './stale-detector.js';
import { GhostItem } from './types.js';

describe('StalenessDetector', () => {
  let detector: StalenessDetector;
  let config: StalenessConfig;

  beforeEach(() => {
    config = {
      thresholdMonths: 12,
      databasePath: 'data/stale-items.db'
    };
    detector = new StalenessDetector(config);
  });

  describe('constructor', () => {
    it('should create a detector with the provided config', () => {
      expect(detector).toBeInstanceOf(StalenessDetector);
    });

    it('should accept custom threshold months', () => {
      const customDetector = new StalenessDetector({
        thresholdMonths: 6,
        databasePath: 'custom/path.db'
      });
      expect(customDetector).toBeInstanceOf(StalenessDetector);
    });
  });

  describe('calculateMonthsStale', () => {
    it('should return 0 for current date', () => {
      const now = new Date().toISOString();
      const months = detector.calculateMonthsStale(now);
      expect(months).toBe(0);
    });

    it('should calculate 12 months for a date 1 year ago', () => {
      const oneYearAgo = new Date();
      oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);
      const months = detector.calculateMonthsStale(oneYearAgo.toISOString());
      expect(months).toBe(12);
    });

    it('should calculate 24 months for a date 2 years ago', () => {
      const twoYearsAgo = new Date();
      twoYearsAgo.setUTCFullYear(twoYearsAgo.getUTCFullYear() - 2);
      const months = detector.calculateMonthsStale(twoYearsAgo.toISOString());
      expect(months).toBe(24);
    });

    it('should calculate 6 months for a date 6 months ago', () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 6);
      const months = detector.calculateMonthsStale(sixMonthsAgo.toISOString());
      expect(months).toBe(6);
    });

    it('should calculate 1 month for a date 1 month ago', () => {
      const oneMonthAgo = new Date();
      oneMonthAgo.setUTCMonth(oneMonthAgo.getUTCMonth() - 1);
      const months = detector.calculateMonthsStale(oneMonthAgo.toISOString());
      expect(months).toBe(1);
    });

    it('should return non-negative value for future dates', () => {
      const future = new Date();
      future.setUTCFullYear(future.getUTCFullYear() + 1);
      const months = detector.calculateMonthsStale(future.toISOString());
      expect(months).toBeGreaterThanOrEqual(0);
    });

    it('should handle dates with different day components correctly', () => {
      // Test that day of month doesn't affect month calculation
      const date1 = new Date('2023-01-01T00:00:00Z');
      const date2 = new Date('2023-01-31T23:59:59Z');
      
      const months1 = detector.calculateMonthsStale(date1.toISOString());
      const months2 = detector.calculateMonthsStale(date2.toISOString());
      
      // Both should be the same number of months from now
      expect(Math.abs(months1 - months2)).toBeLessThanOrEqual(1);
    });

    it('should use UTC timestamps consistently', () => {
      // Create a date in a different timezone
      const date = '2023-01-15T12:00:00+05:00';
      const months = detector.calculateMonthsStale(date);
      expect(months).toBeGreaterThanOrEqual(0);
    });
  });

  describe('isStale', () => {
    const createTestItem = (pushedAt: string): GhostItem => ({
      id: 'test/repo',
      name: 'Test Repo',
      repo: 'test/repo',
      url: 'https://github.com/test/repo',
      description: 'Test repository',
      category: 'Theme',
      tags: ['ghost-theme'],
      stars: 100,
      pushedAt,
      archived: false,
      fork: false,
      license: 'MIT',
      topics: ['ghost'],
      score: 85,
      confidence: 'high',
      notes: null,
      hidden: false
    });

    it('should return false for recently updated items', () => {
      const recentDate = new Date();
      recentDate.setUTCMonth(recentDate.getUTCMonth() - 1);
      const item = createTestItem(recentDate.toISOString());
      expect(detector.isStale(item)).toBe(false);
    });

    it('should return false for items updated exactly at threshold', () => {
      const thresholdDate = new Date();
      thresholdDate.setUTCMonth(thresholdDate.getUTCMonth() - 12);
      const item = createTestItem(thresholdDate.toISOString());
      expect(detector.isStale(item)).toBe(false);
    });

    it('should return true for items updated beyond threshold', () => {
      const oldDate = new Date();
      oldDate.setUTCMonth(oldDate.getUTCMonth() - 13);
      const item = createTestItem(oldDate.toISOString());
      expect(detector.isStale(item)).toBe(true);
    });

    it('should return true for items updated 2 years ago', () => {
      const veryOldDate = new Date();
      veryOldDate.setUTCFullYear(veryOldDate.getUTCFullYear() - 2);
      const item = createTestItem(veryOldDate.toISOString());
      expect(detector.isStale(item)).toBe(true);
    });

    it('should respect custom threshold values', () => {
      const customDetector = new StalenessDetector({
        thresholdMonths: 6,
        databasePath: 'data/stale-items.db'
      });

      const sevenMonthsAgo = new Date();
      sevenMonthsAgo.setUTCMonth(sevenMonthsAgo.getUTCMonth() - 7);
      const item = createTestItem(sevenMonthsAgo.toISOString());

      expect(customDetector.isStale(item)).toBe(true);
    });

    it('should handle edge case at threshold boundary', () => {
      // Item updated exactly 12 months ago should not be stale (threshold is exclusive)
      const exactlyThreshold = new Date();
      exactlyThreshold.setUTCMonth(exactlyThreshold.getUTCMonth() - 12);
      const item = createTestItem(exactlyThreshold.toISOString());
      expect(detector.isStale(item)).toBe(false);

      // Item updated 13 months ago should be stale
      const beyondThreshold = new Date();
      beyondThreshold.setUTCMonth(beyondThreshold.getUTCMonth() - 13);
      const staleItem = createTestItem(beyondThreshold.toISOString());
      expect(detector.isStale(staleItem)).toBe(true);
    });

    it('should never mark Official items as stale', () => {
      // Create an official item that hasn't been updated in 2 years
      const veryOldDate = new Date();
      veryOldDate.setUTCFullYear(veryOldDate.getUTCFullYear() - 2);
      
      const officialItem: GhostItem = {
        id: 'TryGhost/Casper',
        name: 'Casper',
        repo: 'TryGhost/Casper',
        url: 'https://github.com/TryGhost/Casper',
        description: 'Official Ghost theme',
        category: 'Official',
        tags: ['ghost-theme', 'official'],
        stars: 2600,
        pushedAt: veryOldDate.toISOString(),
        archived: false,
        fork: false,
        license: 'MIT',
        topics: ['ghost', 'theme'],
        score: 95,
        confidence: 'high',
        notes: null,
        hidden: false
      };

      // Official items should never be stale, regardless of age
      expect(detector.isStale(officialItem)).toBe(false);
    });
  });

  describe('createStalenessDetector factory', () => {
    it('should create a StalenessDetector instance', () => {
      const detector = createStalenessDetector(config);
      expect(detector).toBeInstanceOf(StalenessDetector);
    });

    it('should create detector with provided config', () => {
      const customConfig: StalenessConfig = {
        thresholdMonths: 18,
        databasePath: 'custom/path.db'
      };
      const detector = createStalenessDetector(customConfig);
      expect(detector).toBeInstanceOf(StalenessDetector);
    });
  });

  describe('detectStaleness', () => {
    const createTestItem = (id: string, name: string, pushedAt: string): GhostItem => ({
      id,
      name,
      repo: id,
      url: `https://github.com/${id}`,
      description: `Test repository ${name}`,
      category: 'Theme',
      tags: ['ghost-theme'],
      stars: 100,
      pushedAt,
      archived: false,
      fork: false,
      license: 'MIT',
      topics: ['ghost'],
      score: 85,
      confidence: 'high',
      notes: null,
      hidden: false
    });

    it('should categorize items as active when within threshold', async () => {
      const recentDate = new Date();
      recentDate.setUTCMonth(recentDate.getUTCMonth() - 6);
      
      const items = [
        createTestItem('test/repo1', 'Repo 1', recentDate.toISOString()),
        createTestItem('test/repo2', 'Repo 2', recentDate.toISOString()),
      ];

      const result = await detector.detectStaleness(items);

      expect(result.activeItems).toHaveLength(2);
      expect(result.staleItems).toHaveLength(0);
      expect(result.reactivatedItems).toHaveLength(0);
      expect(result.stats.activeCount).toBe(2);
      expect(result.stats.newlyStale).toBe(0);
    });

    it('should categorize items as stale when beyond threshold', async () => {
      const oldDate = new Date();
      oldDate.setUTCMonth(oldDate.getUTCMonth() - 18);
      
      const items = [
        createTestItem('test/stale1', 'Stale 1', oldDate.toISOString()),
        createTestItem('test/stale2', 'Stale 2', oldDate.toISOString()),
      ];

      const result = await detector.detectStaleness(items);

      expect(result.activeItems).toHaveLength(0);
      expect(result.staleItems).toHaveLength(2);
      expect(result.reactivatedItems).toHaveLength(0);
      expect(result.stats.activeCount).toBe(0);
      expect(result.stats.newlyStale).toBe(2);
    });

    it('should separate active and stale items correctly', async () => {
      const recentDate = new Date();
      recentDate.setUTCMonth(recentDate.getUTCMonth() - 6);
      
      const oldDate = new Date();
      oldDate.setUTCMonth(oldDate.getUTCMonth() - 18);
      
      const items = [
        createTestItem('test/active1', 'Active 1', recentDate.toISOString()),
        createTestItem('test/stale1', 'Stale 1', oldDate.toISOString()),
        createTestItem('test/active2', 'Active 2', recentDate.toISOString()),
        createTestItem('test/stale2', 'Stale 2', oldDate.toISOString()),
      ];

      const result = await detector.detectStaleness(items);

      expect(result.activeItems).toHaveLength(2);
      expect(result.staleItems).toHaveLength(2);
      expect(result.stats.activeCount).toBe(2);
      expect(result.stats.newlyStale).toBe(2);
      expect(result.stats.totalProcessed).toBe(4);
    });

    it('should add staleDetectedAt timestamp to stale items', async () => {
      const oldDate = new Date();
      oldDate.setUTCMonth(oldDate.getUTCMonth() - 18);
      
      const items = [
        createTestItem('test/stale1', 'Stale 1', oldDate.toISOString()),
      ];

      const result = await detector.detectStaleness(items);

      expect(result.staleItems[0].staleDetectedAt).toBeDefined();
      expect(result.staleItems[0].staleDetectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should calculate monthsStale for stale items', async () => {
      const oldDate = new Date();
      oldDate.setUTCMonth(oldDate.getUTCMonth() - 18);
      
      const items = [
        createTestItem('test/stale1', 'Stale 1', oldDate.toISOString()),
      ];

      const result = await detector.detectStaleness(items);

      expect(result.staleItems[0].monthsStale).toBe(18);
    });

    it('should preserve all metadata when marking items as stale', async () => {
      const oldDate = new Date();
      oldDate.setUTCMonth(oldDate.getUTCMonth() - 18);
      
      const originalItem = createTestItem('test/stale1', 'Stale 1', oldDate.toISOString());
      originalItem.description = 'Custom description';
      originalItem.stars = 500;
      originalItem.tags = ['custom', 'tags'];
      
      const items = [originalItem];

      const result = await detector.detectStaleness(items);

      const staleItem = result.staleItems[0];
      expect(staleItem.id).toBe(originalItem.id);
      expect(staleItem.name).toBe(originalItem.name);
      expect(staleItem.description).toBe(originalItem.description);
      expect(staleItem.stars).toBe(originalItem.stars);
      expect(staleItem.tags).toEqual(originalItem.tags);
    });

    it('should calculate correct statistics', async () => {
      const recentDate = new Date();
      recentDate.setUTCMonth(recentDate.getUTCMonth() - 6);
      
      const oldDate = new Date();
      oldDate.setUTCMonth(oldDate.getUTCMonth() - 18);
      
      const items = [
        createTestItem('test/active1', 'Active 1', recentDate.toISOString()),
        createTestItem('test/active2', 'Active 2', recentDate.toISOString()),
        createTestItem('test/active3', 'Active 3', recentDate.toISOString()),
        createTestItem('test/stale1', 'Stale 1', oldDate.toISOString()),
        createTestItem('test/stale2', 'Stale 2', oldDate.toISOString()),
      ];

      const result = await detector.detectStaleness(items);

      expect(result.stats.totalProcessed).toBe(5);
      expect(result.stats.activeCount).toBe(3);
      expect(result.stats.newlyStale).toBe(2);
      expect(result.stats.reactivated).toBe(0);
    });

    it('should handle empty items array', async () => {
      const result = await detector.detectStaleness([]);

      expect(result.activeItems).toHaveLength(0);
      expect(result.staleItems).toHaveLength(0);
      expect(result.reactivatedItems).toHaveLength(0);
      expect(result.stats.totalProcessed).toBe(0);
    });
  });

  describe('reactivation detection', () => {
    const createTestItem = (id: string, name: string, pushedAt: string): GhostItem => ({
      id,
      name,
      repo: id,
      url: `https://github.com/${id}`,
      description: `Test repository ${name}`,
      category: 'Theme',
      tags: ['ghost-theme'],
      stars: 100,
      pushedAt,
      archived: false,
      fork: false,
      license: 'MIT',
      topics: ['ghost'],
      score: 85,
      confidence: 'high',
      notes: null,
      hidden: false
    });

    it('should detect reactivated items when previously stale items are updated', async () => {
      // Use a unique test database for this test
      const testDbPath = 'data/test-reactivation-1.db';
      const testDetector = new StalenessDetector({
        thresholdMonths: 12,
        databasePath: testDbPath
      });

      try {
        const { createStaleDatabaseManager } = await import('./stale-database.js');
        const dbManager = createStaleDatabaseManager(testDbPath);
        await dbManager.initialize();

        // First pass: mark items as stale
        const oldDate = new Date();
        oldDate.setUTCMonth(oldDate.getUTCMonth() - 18);
        
        const items1 = [
          createTestItem('test/repo1', 'Repo 1', oldDate.toISOString()),
          createTestItem('test/repo2', 'Repo 2', oldDate.toISOString()),
        ];

        const result1 = await testDetector.detectStaleness(items1);
        expect(result1.staleItems).toHaveLength(2);
        expect(result1.reactivatedItems).toHaveLength(0);

        // Persist stale items to database (simulating what the orchestrator does)
        for (const staleItem of result1.staleItems) {
          await dbManager.upsertStaleItem(staleItem);
        }
        dbManager.close();

        // Second pass: update one item to be active again
        const recentDate = new Date();
        recentDate.setUTCMonth(recentDate.getUTCMonth() - 6);
        
        const items2 = [
          createTestItem('test/repo1', 'Repo 1', recentDate.toISOString()), // Now active
          createTestItem('test/repo2', 'Repo 2', oldDate.toISOString()),    // Still stale
        ];

        const result2 = await testDetector.detectStaleness(items2);
        
        expect(result2.activeItems).toHaveLength(1);
        expect(result2.activeItems[0].id).toBe('test/repo1');
        expect(result2.reactivatedItems).toHaveLength(1);
        expect(result2.reactivatedItems[0].id).toBe('test/repo1');
        expect(result2.stats.reactivated).toBe(1);
      } finally {
        // Clean up test database
        const fs = await import('fs');
        if (fs.existsSync(testDbPath)) {
          fs.unlinkSync(testDbPath);
        }
      }
    });

    it('should preserve all metadata during reactivation', async () => {
      // Use a unique test database for this test
      const testDbPath = 'data/test-reactivation-2.db';
      const testDetector = new StalenessDetector({
        thresholdMonths: 12,
        databasePath: testDbPath
      });

      try {
        const { createStaleDatabaseManager } = await import('./stale-database.js');
        const dbManager = createStaleDatabaseManager(testDbPath);
        await dbManager.initialize();

        // First pass: mark item as stale
        const oldDate = new Date();
        oldDate.setUTCMonth(oldDate.getUTCMonth() - 18);
        
        const staleItem = createTestItem('test/repo1', 'Repo 1', oldDate.toISOString());
        staleItem.description = 'Custom description';
        staleItem.stars = 500;
        staleItem.tags = ['custom', 'tags'];
        
        const result1 = await testDetector.detectStaleness([staleItem]);
        expect(result1.staleItems).toHaveLength(1);

        // Persist stale item to database
        for (const item of result1.staleItems) {
          await dbManager.upsertStaleItem(item);
        }
        dbManager.close();

        // Second pass: reactivate the item
        const recentDate = new Date();
        recentDate.setUTCMonth(recentDate.getUTCMonth() - 6);
        
        const activeItem = createTestItem('test/repo1', 'Repo 1', recentDate.toISOString());
        activeItem.description = 'Custom description';
        activeItem.stars = 500;
        activeItem.tags = ['custom', 'tags'];
        
        const result2 = await testDetector.detectStaleness([activeItem]);
        
        expect(result2.reactivatedItems).toHaveLength(1);
        const reactivated = result2.reactivatedItems[0];
        expect(reactivated.id).toBe('test/repo1');
        expect(reactivated.description).toBe('Custom description');
        expect(reactivated.stars).toBe(500);
        expect(reactivated.tags).toEqual(['custom', 'tags']);
      } finally {
        // Clean up test database
        const fs = await import('fs');
        if (fs.existsSync(testDbPath)) {
          fs.unlinkSync(testDbPath);
        }
      }
    });

    it('should not include reactivated items in stale list', async () => {
      // Use a unique test database for this test
      const testDbPath = 'data/test-reactivation-3.db';
      const testDetector = new StalenessDetector({
        thresholdMonths: 12,
        databasePath: testDbPath
      });

      try {
        const { createStaleDatabaseManager } = await import('./stale-database.js');
        const dbManager = createStaleDatabaseManager(testDbPath);
        await dbManager.initialize();

        // First pass: mark item as stale
        const oldDate = new Date();
        oldDate.setUTCMonth(oldDate.getUTCMonth() - 18);
        
        const items1 = [
          createTestItem('test/repo1', 'Repo 1', oldDate.toISOString()),
        ];

        const result1 = await testDetector.detectStaleness(items1);

        // Persist stale item to database
        for (const item of result1.staleItems) {
          await dbManager.upsertStaleItem(item);
        }
        dbManager.close();

        // Second pass: reactivate the item
        const recentDate = new Date();
        recentDate.setUTCMonth(recentDate.getUTCMonth() - 6);
        
        const items2 = [
          createTestItem('test/repo1', 'Repo 1', recentDate.toISOString()),
        ];

        const result2 = await testDetector.detectStaleness(items2);
        
        expect(result2.activeItems).toHaveLength(1);
        expect(result2.staleItems).toHaveLength(0);
        expect(result2.reactivatedItems).toHaveLength(1);
        
        // Verify the item is not in both lists
        const activeIds = result2.activeItems.map(i => i.id);
        const staleIds = result2.staleItems.map(i => i.id);
        const reactivatedIds = result2.reactivatedItems.map(i => i.id);
        
        expect(activeIds).toContain('test/repo1');
        expect(staleIds).not.toContain('test/repo1');
        expect(reactivatedIds).toContain('test/repo1');
      } finally {
        // Clean up test database
        const fs = await import('fs');
        if (fs.existsSync(testDbPath)) {
          fs.unlinkSync(testDbPath);
        }
      }
    });

    it('should handle multiple reactivations in a single run', async () => {
      // Use a unique test database for this test
      const testDbPath = 'data/test-reactivation-4.db';
      const testDetector = new StalenessDetector({
        thresholdMonths: 12,
        databasePath: testDbPath
      });

      try {
        const { createStaleDatabaseManager } = await import('./stale-database.js');
        const dbManager = createStaleDatabaseManager(testDbPath);
        await dbManager.initialize();

        // First pass: mark multiple items as stale
        const oldDate = new Date();
        oldDate.setUTCMonth(oldDate.getUTCMonth() - 18);
        
        const items1 = [
          createTestItem('test/repo1', 'Repo 1', oldDate.toISOString()),
          createTestItem('test/repo2', 'Repo 2', oldDate.toISOString()),
          createTestItem('test/repo3', 'Repo 3', oldDate.toISOString()),
        ];

        const result1 = await testDetector.detectStaleness(items1);

        // Persist stale items to database
        for (const item of result1.staleItems) {
          await dbManager.upsertStaleItem(item);
        }
        dbManager.close();

        // Second pass: reactivate two items
        const recentDate = new Date();
        recentDate.setUTCMonth(recentDate.getUTCMonth() - 6);
        
        const items2 = [
          createTestItem('test/repo1', 'Repo 1', recentDate.toISOString()), // Reactivated
          createTestItem('test/repo2', 'Repo 2', recentDate.toISOString()), // Reactivated
          createTestItem('test/repo3', 'Repo 3', oldDate.toISOString()),    // Still stale
        ];

        const result2 = await testDetector.detectStaleness(items2);
        
        expect(result2.activeItems).toHaveLength(2);
        expect(result2.reactivatedItems).toHaveLength(2);
        expect(result2.stats.reactivated).toBe(2);
        
        const reactivatedIds = result2.reactivatedItems.map(i => i.id);
        expect(reactivatedIds).toContain('test/repo1');
        expect(reactivatedIds).toContain('test/repo2');
      } finally {
        // Clean up test database
        const fs = await import('fs');
        if (fs.existsSync(testDbPath)) {
          fs.unlinkSync(testDbPath);
        }
      }
    });
  });

  describe('UTC timestamp handling', () => {
    const createTestItem = (id: string, pushedAt: string): GhostItem => ({
      id,
      name: 'Test Repo',
      repo: id,
      url: `https://github.com/${id}`,
      description: 'Test repository',
      category: 'Theme',
      tags: ['ghost-theme'],
      stars: 100,
      pushedAt,
      archived: false,
      fork: false,
      license: 'MIT',
      topics: ['ghost'],
      score: 85,
      confidence: 'high',
      notes: null,
      hidden: false
    });

    it('should handle timestamps with different timezone offsets consistently', () => {
      // Same moment in time, different timezone representations
      const utcTime = '2023-01-15T12:00:00Z';
      const plusFiveTime = '2023-01-15T17:00:00+05:00';
      const minusEightTime = '2023-01-15T04:00:00-08:00';

      const months1 = detector.calculateMonthsStale(utcTime);
      const months2 = detector.calculateMonthsStale(plusFiveTime);
      const months3 = detector.calculateMonthsStale(minusEightTime);

      // All should calculate the same number of months
      expect(months1).toBe(months2);
      expect(months2).toBe(months3);
    });

    it('should handle ISO 8601 timestamps correctly', () => {
      const isoTimestamp = '2023-06-15T14:30:00.000Z';
      const months = detector.calculateMonthsStale(isoTimestamp);
      expect(months).toBeGreaterThanOrEqual(0);
    });

    it('should handle timestamps without milliseconds', () => {
      const timestamp = '2023-06-15T14:30:00Z';
      const months = detector.calculateMonthsStale(timestamp);
      expect(months).toBeGreaterThanOrEqual(0);
    });

    it('should handle timestamps with milliseconds', () => {
      const timestamp = '2023-06-15T14:30:00.123Z';
      const months = detector.calculateMonthsStale(timestamp);
      expect(months).toBeGreaterThanOrEqual(0);
    });

    it('should calculate staleness consistently across different timezones', async () => {
      // Create items with same moment in different timezone formats
      const items = [
        createTestItem('test/repo1', '2023-01-15T12:00:00Z'),
        createTestItem('test/repo2', '2023-01-15T17:00:00+05:00'),
        createTestItem('test/repo3', '2023-01-15T04:00:00-08:00'),
      ];

      const result = await detector.detectStaleness(items);

      // All items should be categorized the same way
      const allActive = result.activeItems.length === 3;
      const allStale = result.staleItems.length === 3;
      
      expect(allActive || allStale).toBe(true);
    });
  });
});
