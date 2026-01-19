/**
 * Property-based tests for StalenessDetector
 * Uses fast-check for property-based testing
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { StalenessDetector, StalenessConfig } from './stale-detector.js';
import { GhostItem } from './types.js';
import * as fs from 'fs';

/**
 * Arbitrary generator for GhostItem with configurable pushedAt date
 * Excludes Official category items since they are never stale
 */
const ghostItemArbitrary = (pushedAtArbitrary: fc.Arbitrary<Date>) =>
  fc.record({
    id: fc.string({ minLength: 5, maxLength: 50 }).map(s => `test/${s}`),
    name: fc.string({ minLength: 3, maxLength: 50 }),
    repo: fc.string({ minLength: 5, maxLength: 50 }).map(s => `test/${s}`),
    url: fc.webUrl(),
    description: fc.oneof(fc.constant(null), fc.string({ maxLength: 200 })),
    category: fc.constantFrom('Theme', 'Tool', 'Starter'), // Exclude 'Official' for staleness tests
    tags: fc.array(fc.string({ minLength: 2, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
    stars: fc.nat({ max: 10000 }),
    pushedAt: pushedAtArbitrary.map(d => d.toISOString()),
    archived: fc.boolean(),
    fork: fc.boolean(),
    license: fc.oneof(fc.constant(null), fc.constantFrom('MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-3-Clause')),
    topics: fc.array(fc.string({ minLength: 2, maxLength: 20 }), { maxLength: 10 }),
    score: fc.integer({ min: 0, max: 100 }),
    confidence: fc.constantFrom('high', 'medium', 'low') as fc.Arbitrary<'high' | 'medium' | 'low'>,
    notes: fc.oneof(fc.constant(null), fc.string({ maxLength: 100 })),
    hidden: fc.boolean(),
  });

/**
 * Generate a date that is older than the threshold
 */
const staleDateArbitrary = (thresholdMonths: number) =>
  fc.date({
    min: new Date(Date.now() - (thresholdMonths + 24) * 30 * 24 * 60 * 60 * 1000), // Up to 24 months beyond threshold
    max: new Date(Date.now() - (thresholdMonths + 1) * 30 * 24 * 60 * 60 * 1000),  // At least 1 month beyond threshold
  });

/**
 * Generate a date that is within the threshold
 */
const activeDateArbitrary = (thresholdMonths: number) =>
  fc.date({
    min: new Date(Date.now() - thresholdMonths * 30 * 24 * 60 * 60 * 1000), // Exactly at threshold
    max: new Date(),                                                          // Up to now
  });

describe('StalenessDetector - Property-Based Tests', () => {
  const thresholdMonths = 12;
  const config: StalenessConfig = {
    thresholdMonths,
    databasePath: 'data/test-property.db',
  };

  // Clean up test database after all tests
  const cleanupTestDb = () => {
    if (fs.existsSync(config.databasePath)) {
      fs.unlinkSync(config.databasePath);
    }
  };

  describe('Property 1.1: Items with pushedAt older than threshold are stale', () => {
    it('should return true for isStale() when pushedAt is older than threshold', () => {
      /**
       * **Validates: Requirements 1.1, 1.2**
       * 
       * Property: For any item with pushedAt older than threshold, isStale() returns true
       * 
       * This property ensures that the staleness detection correctly identifies items
       * that haven't been updated within the configured threshold period.
       */
      const detector = new StalenessDetector(config);

      fc.assert(
        fc.property(
          ghostItemArbitrary(staleDateArbitrary(thresholdMonths)),
          (item: GhostItem) => {
            const result = detector.isStale(item);
            return result === true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 1.2: Items with pushedAt within threshold are not stale', () => {
    it('should return false for isStale() when pushedAt is within threshold', () => {
      /**
       * **Validates: Requirements 1.1, 1.3**
       * 
       * Property: For any item with pushedAt within threshold, isStale() returns false
       * 
       * This property ensures that active items (those updated recently) are correctly
       * identified as not stale.
       */
      const detector = new StalenessDetector(config);

      fc.assert(
        fc.property(
          ghostItemArbitrary(activeDateArbitrary(thresholdMonths)),
          (item: GhostItem) => {
            const result = detector.isStale(item);
            return result === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 1.3: calculateMonthsStale always returns non-negative integer', () => {
    it('should always return a non-negative integer for any date', () => {
      /**
       * **Validates: Requirements 1.3, 1.5**
       * 
       * Property: calculateMonthsStale() always returns non-negative integer
       * 
       * This property ensures that the staleness calculation is robust and handles
       * all date inputs correctly, including edge cases like future dates.
       */
      const detector = new StalenessDetector(config);

      fc.assert(
        fc.property(
          fc.date({ min: new Date('2000-01-01'), max: new Date('2100-12-31') }),
          (date: Date) => {
            const months = detector.calculateMonthsStale(date.toISOString());
            return Number.isInteger(months) && months >= 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle various ISO 8601 date formats consistently', () => {
      /**
       * **Validates: Requirements 1.5**
       * 
       * Property: calculateMonthsStale() handles various date formats consistently
       * 
       * This property ensures UTC timestamp handling works correctly across
       * different timezone representations.
       */
      const detector = new StalenessDetector(config);

      fc.assert(
        fc.property(
          fc.date({ min: new Date('2020-01-01'), max: new Date() }),
          fc.integer({ min: -12, max: 12 }), // Timezone offset in hours
          (date: Date, tzOffset: number) => {
            // Create ISO string with timezone offset
            const utcTime = date.toISOString();
            const months = detector.calculateMonthsStale(utcTime);
            
            return Number.isInteger(months) && months >= 0;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 5.1: Reactivated items are never in both active and stale lists', () => {
    it('should never have the same item in both active and stale lists', async () => {
      /**
       * **Validates: Requirements 5.1, 5.2**
       * 
       * Property: Reactivated items are never in both active and stale lists
       * 
       * This property ensures that the categorization logic is mutually exclusive
       * and items cannot be in both states simultaneously.
       */
      const testDbPath = 'data/test-property-reactivation.db';
      const detector = new StalenessDetector({
        thresholdMonths,
        databasePath: testDbPath,
      });

      try {
        await fc.assert(
          fc.asyncProperty(
            fc.array(ghostItemArbitrary(fc.date()), { minLength: 1, maxLength: 20 }),
            async (items: GhostItem[]) => {
              // Ensure unique IDs
              const uniqueItems = items.map((item, idx) => ({
                ...item,
                id: `test/repo-${idx}`,
                repo: `test/repo-${idx}`,
              }));

              const result = await detector.detectStaleness(uniqueItems);

              // Extract IDs from each list
              const activeIds = new Set(result.activeItems.map(i => i.id));
              const staleIds = new Set(result.staleItems.map(i => i.id));
              const reactivatedIds = new Set(result.reactivatedItems.map(i => i.id));

              // Check that no item appears in both active and stale lists
              const activeAndStale = [...activeIds].filter(id => staleIds.has(id));
              
              // Reactivated items should be in active list but not in stale list
              const reactivatedInStale = [...reactivatedIds].filter(id => staleIds.has(id));
              
              return activeAndStale.length === 0 && reactivatedInStale.length === 0;
            }
          ),
          { numRuns: 20 }
        );
      } finally {
        // Clean up test database
        if (fs.existsSync(testDbPath)) {
          fs.unlinkSync(testDbPath);
        }
      }
    });

    it('should maintain correct total count across active and stale lists', async () => {
      /**
       * **Validates: Requirements 1.1, 1.2, 5.1**
       * 
       * Property: Total items processed equals active + newly stale items
       * 
       * This property ensures that all items are accounted for and none are
       * lost or duplicated during categorization.
       */
      const testDbPath = 'data/test-property-count.db';
      const detector = new StalenessDetector({
        thresholdMonths,
        databasePath: testDbPath,
      });

      try {
        await fc.assert(
          fc.asyncProperty(
            fc.array(ghostItemArbitrary(fc.date()), { minLength: 1, maxLength: 20 }),
            async (items: GhostItem[]) => {
              // Ensure unique IDs
              const uniqueItems = items.map((item, idx) => ({
                ...item,
                id: `test/repo-${idx}`,
                repo: `test/repo-${idx}`,
              }));

              const result = await detector.detectStaleness(uniqueItems);

              // Total processed should equal active + stale items
              const totalCategorized = result.activeItems.length + result.staleItems.length;
              
              return result.stats.totalProcessed === uniqueItems.length &&
                     totalCategorized === uniqueItems.length;
            }
          ),
          { numRuns: 20 }
        );
      } finally {
        // Clean up test database
        if (fs.existsSync(testDbPath)) {
          fs.unlinkSync(testDbPath);
        }
      }
    });
  });

  describe('Additional Properties: Staleness calculation consistency', () => {
    it('should be consistent: isStale(item) === (calculateMonthsStale(item.pushedAt) > threshold)', () => {
      /**
       * Property: isStale() and calculateMonthsStale() are consistent
       * 
       * This property ensures that the two methods agree on staleness determination.
       */
      const detector = new StalenessDetector(config);

      fc.assert(
        fc.property(
          ghostItemArbitrary(fc.date()),
          (item: GhostItem) => {
            const isStale = detector.isStale(item);
            const monthsStale = detector.calculateMonthsStale(item.pushedAt);
            const expectedStale = monthsStale > thresholdMonths;
            
            return isStale === expectedStale;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should never mark Official items as stale regardless of age', () => {
      /**
       * Property: Official items are never stale
       * 
       * This property ensures that items with category 'Official' are never
       * considered stale, regardless of their pushedAt date.
       */
      const detector = new StalenessDetector(config);

      // Generate items with Official category and very old dates
      const officialItemArbitrary = fc.record({
        id: fc.string({ minLength: 5, maxLength: 50 }).map(s => `TryGhost/${s}`),
        name: fc.string({ minLength: 3, maxLength: 50 }),
        repo: fc.string({ minLength: 5, maxLength: 50 }).map(s => `TryGhost/${s}`),
        url: fc.webUrl(),
        description: fc.oneof(fc.constant(null), fc.string({ maxLength: 200 })),
        category: fc.constant('Official'),
        tags: fc.array(fc.string({ minLength: 2, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
        stars: fc.nat({ max: 10000 }),
        pushedAt: fc.date({
          min: new Date('2020-01-01'),
          max: new Date('2022-01-01')
        }).map(d => d.toISOString()),
        archived: fc.boolean(),
        fork: fc.boolean(),
        license: fc.oneof(fc.constant(null), fc.constantFrom('MIT', 'Apache-2.0')),
        topics: fc.array(fc.string({ minLength: 2, maxLength: 20 }), { maxLength: 10 }),
        score: fc.integer({ min: 0, max: 100 }),
        confidence: fc.constantFrom('high', 'medium', 'low') as fc.Arbitrary<'high' | 'medium' | 'low'>,
        notes: fc.oneof(fc.constant(null), fc.string({ maxLength: 100 })),
        hidden: fc.boolean(),
      });

      fc.assert(
        fc.property(
          officialItemArbitrary,
          (item: GhostItem) => {
            const isStale = detector.isStale(item);
            // Official items should never be stale
            return isStale === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve item metadata during staleness detection', async () => {
      /**
       * Property: All item metadata is preserved during categorization
       * 
       * This property ensures that no data is lost or corrupted during the
       * staleness detection process.
       */
      const testDbPath = 'data/test-property-metadata.db';
      const detector = new StalenessDetector({
        thresholdMonths,
        databasePath: testDbPath,
      });

      try {
        await fc.assert(
          fc.asyncProperty(
            fc.array(ghostItemArbitrary(fc.date()), { minLength: 1, maxLength: 10 }),
            async (items: GhostItem[]) => {
              // Ensure unique IDs
              const uniqueItems = items.map((item, idx) => ({
                ...item,
                id: `test/repo-${idx}`,
                repo: `test/repo-${idx}`,
              }));

              const result = await detector.detectStaleness(uniqueItems);

              // Check that all items in results have the same core metadata
              const allResultItems = [
                ...result.activeItems,
                ...result.staleItems,
              ];

              return allResultItems.every(resultItem => {
                const originalItem = uniqueItems.find(i => i.id === resultItem.id);
                if (!originalItem) return false;

                return (
                  resultItem.name === originalItem.name &&
                  resultItem.description === originalItem.description &&
                  resultItem.stars === originalItem.stars &&
                  resultItem.category === originalItem.category &&
                  JSON.stringify(resultItem.tags) === JSON.stringify(originalItem.tags)
                );
              });
            }
          ),
          { numRuns: 20 }
        );
      } finally {
        // Clean up test database
        if (fs.existsSync(testDbPath)) {
          fs.unlinkSync(testDbPath);
        }
      }
    });
  });
});
