#!/usr/bin/env node

/**
 * Performance Testing for Stale Items Tracking
 * 
 * Tests performance with large datasets:
 * - Database query performance
 * - HTML rendering time
 * - Staleness detection speed
 * 
 * **Validates: Requirements 2.1, 3.1, 4.1**
 */

import { createStalenessDetector } from './stale-detector.js';
import { createStaleDatabaseManager } from './stale-database.js';
import { createStaleRenderer } from './stale-renderer.js';
import { GhostItem } from './types.js';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB_PATH = 'data/test-performance.db';
const TEST_HTML_PATH = 'test-performance.html';

/**
 * Generate test data with specified size
 */
function generateTestData(count: number): GhostItem[] {
  const items: GhostItem[] = [];
  const currentDate = new Date();
  const categories = ['Theme', 'Tool', 'Starter', 'Official'];

  for (let i = 0; i < count; i++) {
    // Create mix of active and stale items
    const monthsAgo = Math.floor(Math.random() * 60); // 0-60 months ago
    const pushedDate = new Date(currentDate);
    pushedDate.setMonth(pushedDate.getMonth() - monthsAgo);

    items.push({
      id: `test/item-${i}`,
      name: `Test Item ${i}`,
      repo: `test/item-${i}`,
      url: `https://github.com/test/item-${i}`,
      description: `Test item ${i} for performance testing`,
      category: categories[i % categories.length],
      tags: ['ghost-theme', 'test'],
      stars: Math.floor(Math.random() * 1000),
      pushedAt: pushedDate.toISOString(),
      archived: false,
      fork: false,
      license: 'MIT',
      topics: ['ghost', 'test'],
      score: 70 + Math.floor(Math.random() * 30),
      confidence: 'high',
      notes: null,
      hidden: false
    });
  }

  return items;
}

/**
 * Measure execution time of a function
 */
async function measureTime<T>(name: string, fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  console.log(`  ${name}: ${duration.toFixed(2)}ms`);
  return { result, duration };
}

/**
 * Test staleness detection performance
 */
async function testStalenessDetection(itemCount: number): Promise<number> {
  console.log(`\n🔍 Testing Staleness Detection (${itemCount} items)`);
  
  const items = generateTestData(itemCount);
  const detector = createStalenessDetector({
    thresholdMonths: 12,
    databasePath: TEST_DB_PATH
  });

  const { duration } = await measureTime('Detection', async () => {
    return await detector.detectStaleness(items);
  });

  return duration;
}

/**
 * Test database operations performance
 */
async function testDatabaseOperations(itemCount: number): Promise<{ insert: number; query: number; stats: number }> {
  console.log(`\n💾 Testing Database Operations (${itemCount} items)`);
  
  const items = generateTestData(itemCount);
  const detector = createStalenessDetector({
    thresholdMonths: 12,
    databasePath: TEST_DB_PATH
  });

  const result = await detector.detectStaleness(items);
  
  const dbManager = createStaleDatabaseManager(TEST_DB_PATH);
  await dbManager.initialize();

  try {
    // Test insert/update performance
    const { duration: insertDuration } = await measureTime('Insert/Update', async () => {
      for (const staleItem of result.staleItems) {
        await dbManager.upsertStaleItem(staleItem);
      }
    });

    // Test query performance
    const { duration: queryDuration } = await measureTime('Query All', async () => {
      return await dbManager.getAllStaleItems();
    });

    // Test statistics generation
    const { duration: statsDuration } = await measureTime('Statistics', async () => {
      return await dbManager.getStatistics();
    });

    // Test category query
    await measureTime('Query by Category', async () => {
      return await dbManager.getStaleItemsByCategory('Theme');
    });

    return {
      insert: insertDuration,
      query: queryDuration,
      stats: statsDuration
    };

  } finally {
    dbManager.close();
  }
}

/**
 * Test HTML rendering performance
 */
async function testHtmlRendering(itemCount: number): Promise<number> {
  console.log(`\n🎨 Testing HTML Rendering (${itemCount} items)`);
  
  const dbManager = createStaleDatabaseManager(TEST_DB_PATH);
  await dbManager.initialize();

  try {
    const staleItems = await dbManager.getAllStaleItems();
    const renderer = createStaleRenderer();

    const { duration } = await measureTime('Render HTML', async () => {
      renderer.renderToFile(
        'templates/stale.template.html',
        TEST_HTML_PATH,
        staleItems,
        {
          title: 'Performance Test',
          subtitle: 'Performance Test Page',
          warningMessage: 'Test warning',
          thresholdMonths: 12,
          statistics: renderer.generateStatistics(staleItems, itemCount)
        }
      );
    });

    return duration;

  } finally {
    dbManager.close();
  }
}

/**
 * Run performance tests with different dataset sizes
 */
async function runPerformanceTests() {
  console.log('🚀 Starting Performance Tests\n');
  console.log('=' .repeat(60));

  const testSizes = [100, 500, 1000, 2000];
  const results: Array<{
    size: number;
    detection: number;
    insert: number;
    query: number;
    stats: number;
    render: number;
  }> = [];

  for (const size of testSizes) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing with ${size} items`);
    console.log('='.repeat(60));

    // Clean up previous test data
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    if (existsSync(TEST_HTML_PATH)) {
      unlinkSync(TEST_HTML_PATH);
    }

    const detectionTime = await testStalenessDetection(size);
    const dbTimes = await testDatabaseOperations(size);
    const renderTime = await testHtmlRendering(size);

    results.push({
      size,
      detection: detectionTime,
      insert: dbTimes.insert,
      query: dbTimes.query,
      stats: dbTimes.stats,
      render: renderTime
    });
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Performance Summary\n');
  console.log('Size\tDetect\tInsert\tQuery\tStats\tRender\tTotal');
  console.log('-'.repeat(60));

  for (const result of results) {
    const total = result.detection + result.insert + result.query + result.stats + result.render;
    console.log(
      `${result.size}\t${result.detection.toFixed(0)}ms\t${result.insert.toFixed(0)}ms\t` +
      `${result.query.toFixed(0)}ms\t${result.stats.toFixed(0)}ms\t${result.render.toFixed(0)}ms\t${total.toFixed(0)}ms`
    );
  }

  // Performance analysis
  console.log('\n📈 Performance Analysis\n');

  // Check if performance scales linearly
  const baseline = results[0];
  const largest = results[results.length - 1];
  const scaleFactor = largest.size / baseline.size;

  console.log(`Scale factor: ${scaleFactor}x (from ${baseline.size} to ${largest.size} items)`);
  console.log('\nScaling efficiency (actual vs expected):');
  
  const metrics = ['detection', 'insert', 'query', 'stats', 'render'] as const;
  for (const metric of metrics) {
    const actualRatio = largest[metric] / baseline[metric];
    const efficiency = (scaleFactor / actualRatio) * 100;
    const status = efficiency > 80 ? '✓' : efficiency > 50 ? '⚠️' : '✗';
    console.log(`  ${status} ${metric}: ${actualRatio.toFixed(2)}x (${efficiency.toFixed(0)}% efficient)`);
  }

  // Performance thresholds
  console.log('\n🎯 Performance Thresholds\n');
  
  const thresholds = {
    detection: 1000, // 1 second for 1000 items
    insert: 2000,    // 2 seconds for 1000 items
    query: 100,      // 100ms for 1000 items
    stats: 50,       // 50ms for 1000 items
    render: 500      // 500ms for 1000 items
  };

  const thousandItemResult = results.find(r => r.size === 1000);
  if (thousandItemResult) {
    let allPassed = true;
    for (const [metric, threshold] of Object.entries(thresholds)) {
      const actual = thousandItemResult[metric as keyof typeof thresholds];
      const passed = actual <= threshold;
      const status = passed ? '✓' : '✗';
      console.log(`  ${status} ${metric}: ${actual.toFixed(0)}ms (threshold: ${threshold}ms)`);
      if (!passed) allPassed = false;
    }

    if (allPassed) {
      console.log('\n✅ All performance thresholds met!');
    } else {
      console.log('\n⚠️  Some performance thresholds exceeded');
    }
  }

  // Clean up
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }
  if (existsSync(TEST_HTML_PATH)) {
    unlinkSync(TEST_HTML_PATH);
  }

  console.log('\n✅ Performance tests completed');
}

// Run tests
runPerformanceTests().catch(error => {
  console.error('❌ Performance test error:', error);
  process.exit(1);
});
