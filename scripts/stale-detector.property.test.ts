import { describe, it, afterAll } from 'vitest';
import * as fc from 'fast-check';
import { StalenessDetector, StalenessConfig } from './stale-detector.js';
import { GhostItem } from './types.js';
import * as fs from 'fs';

const ghostItemArbitrary = (pushedAtArbitrary: fc.Arbitrary<Date>) =>
  fc.record({
    id: fc.string({ minLength: 5, maxLength: 50 }).map(s => `test/${s}`),
    name: fc.string({ minLength: 3, maxLength: 50 }),
    repo: fc.string({ minLength: 5, maxLength: 50 }).map(s => `test/${s}`),
    url: fc.webUrl(),
    description: fc.oneof(fc.constant(null), fc.string({ maxLength: 200 })),
    category: fc.constantFrom('Theme', 'Tool', 'Starter', 'Official'),
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

const staleDateArbitrary = (thresholdMonths: number) =>
  fc.date({
    min: new Date(Date.now() - (thresholdMonths + 24) * 30 * 24 * 60 * 60 * 1000),
    max: new Date(Date.now() - (thresholdMonths + 1) * 30 * 24 * 60 * 60 * 1000),
  });

const activeDateArbitrary = (thresholdMonths: number) =>
  fc.date({
    min: new Date(Date.now() - thresholdMonths * 30 * 24 * 60 * 60 * 1000),
    max: new Date(),
  });

describe('StalenessDetector - Property-Based Tests', () => {
  const thresholdMonths = 12;
  const config: StalenessConfig = {
    thresholdMonths,
    databasePath: 'data/test-property.db',
  };

  afterAll(() => {
    if (fs.existsSync(config.databasePath)) {
      fs.unlinkSync(config.databasePath);
    }
  });

  describe('Property 1.1: Items with pushedAt older than threshold are stale', () => {
    it('should return true for isStale() when pushedAt is older than threshold', () => {
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
      const detector = new StalenessDetector(config);

      fc.assert(
        fc.property(
          fc.date({ min: new Date('2020-01-01'), max: new Date() }),
          (date: Date) => {
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
              const uniqueItems = items.map((item, idx) => ({
                ...item,
                id: `test/repo-${idx}`,
                repo: `test/repo-${idx}`,
              }));

              const result = await detector.detectStaleness(uniqueItems);

              const activeIds = new Set(result.activeItems.map(i => i.id));
              const staleIds = new Set(result.staleItems.map(i => i.id));
              const reactivatedIds = new Set(result.reactivatedItems.map(i => i.id));

              const activeAndStale = [...activeIds].filter(id => staleIds.has(id));

              const reactivatedInStale = [...reactivatedIds].filter(id => staleIds.has(id));
              
              return activeAndStale.length === 0 && reactivatedInStale.length === 0;
            }
          ),
          { numRuns: 20 }
        );
      } finally {
        if (fs.existsSync(testDbPath)) {
          fs.unlinkSync(testDbPath);
        }
      }
    });

    it('should maintain correct total count across active and stale lists', async () => {
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
              const uniqueItems = items.map((item, idx) => ({
                ...item,
                id: `test/repo-${idx}`,
                repo: `test/repo-${idx}`,
              }));

              const result = await detector.detectStaleness(uniqueItems);

              const totalCategorized = result.activeItems.length + result.staleItems.length;
              
              return result.stats.totalProcessed === uniqueItems.length &&
                     totalCategorized === uniqueItems.length;
            }
          ),
          { numRuns: 20 }
        );
      } finally {
        if (fs.existsSync(testDbPath)) {
          fs.unlinkSync(testDbPath);
        }
      }
    });
  });

  describe('Additional Properties: Staleness calculation consistency', () => {
    it('should be consistent: isStale(item) === (calculateMonthsStale(item.pushedAt) > threshold)', () => {
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

    it('should preserve item metadata during staleness detection', async () => {
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
              const uniqueItems = items.map((item, idx) => ({
                ...item,
                id: `test/repo-${idx}`,
                repo: `test/repo-${idx}`,
              }));

              const result = await detector.detectStaleness(uniqueItems);

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
        if (fs.existsSync(testDbPath)) {
          fs.unlinkSync(testDbPath);
        }
      }
    });
  });
});
