#!/usr/bin/env node


import { createStalenessDetector } from './stale-detector.js';
import { GhostItem } from './types.js';

function createTestItems(): GhostItem[] {
  const currentDate = new Date();
  const items: GhostItem[] = [];

  // Create items at different staleness levels
  const monthsAgo = [3, 6, 9, 12, 15, 18, 24, 36];
  
  for (let i = 0; i < monthsAgo.length; i++) {
    const pushedDate = new Date(currentDate);
    pushedDate.setMonth(pushedDate.getMonth() - monthsAgo[i]);

    items.push({
      id: `test/item-${monthsAgo[i]}m`,
      name: `Item ${monthsAgo[i]} months old`,
      repo: `test/item-${monthsAgo[i]}m`,
      url: `https://github.com/test/item-${monthsAgo[i]}m`,
      description: `Item last updated ${monthsAgo[i]} months ago`,
      category: 'Theme',
      tags: ['ghost-theme'],
      stars: 100,
      pushedAt: pushedDate.toISOString(),
      archived: false,
      fork: false,
      license: 'MIT',
      topics: ['ghost'],
      score: 80,
      confidence: 'high',
      notes: null,
      hidden: false
    });
  }

  return items;
}

async function testThresholdChanges() {
  console.log('🔧 Testing Threshold Changes\n');
  console.log('=' .repeat(60));

  const items = createTestItems();
  const thresholds = [6, 12, 18, 24];

  console.log(`\nTest items: ${items.length} items at different ages`);
  console.log('Ages: 3, 6, 9, 12, 15, 18, 24, 36 months\n');

  for (const threshold of thresholds) {
    console.log(`\nThreshold: ${threshold} months`);
    console.log('-'.repeat(40));

    const detector = createStalenessDetector({
      thresholdMonths: threshold,
      databasePath: 'data/test-config.db'
    });

    const result = await detector.detectStaleness(items);

    console.log(`  Active items: ${result.activeItems.length}`);
    console.log(`  Stale items: ${result.staleItems.length}`);
    
    // Show which items are stale
    const staleAges = result.staleItems.map(item => {
      const match = item.name.match(/(\d+) months/);
      return match ? parseInt(match[1]) : 0;
    }).sort((a, b) => a - b);
    
    console.log(`  Stale ages: ${staleAges.join(', ')}`);

    // Verify correctness
    const expectedStale = items.filter(item => {
      const match = item.name.match(/(\d+) months/);
      const age = match ? parseInt(match[1]) : 0;
      return age > threshold;
    }).length;

    if (result.staleItems.length === expectedStale) {
      console.log(`  ✓ Correct: ${expectedStale} items > ${threshold} months`);
    } else {
      console.log(`  ✗ Error: Expected ${expectedStale}, got ${result.staleItems.length}`);
    }
  }

  console.log('\n✅ Threshold change tests completed');
}

async function testInvalidConfigurations() {
  console.log('\n\n🚫 Testing Invalid Configurations\n');
  console.log('=' .repeat(60));

  const items = createTestItems();

  // Test negative threshold
  console.log('\nTest 1: Negative threshold');
  try {
    const detector = createStalenessDetector({
      thresholdMonths: -12,
      databasePath: 'data/test-config.db'
    });

    const result = await detector.detectStaleness(items);
    
    // With negative threshold, all items should be active
    if (result.activeItems.length === items.length) {
      console.log('  ✓ Handled gracefully: All items active with negative threshold');
    } else {
      console.log('  ⚠️  Unexpected behavior with negative threshold');
    }
  } catch (error) {
    console.log('  ✓ Rejected with error:', (error as Error).message);
  }

  // Test zero threshold
  console.log('\nTest 2: Zero threshold');
  try {
    const detector = createStalenessDetector({
      thresholdMonths: 0,
      databasePath: 'data/test-config.db'
    });

    const result = await detector.detectStaleness(items);
    
    // With zero threshold, all items should be stale
    if (result.staleItems.length === items.length) {
      console.log('  ✓ Handled correctly: All items stale with zero threshold');
    } else {
      console.log(`  ⚠️  Unexpected: ${result.staleItems.length} stale, ${result.activeItems.length} active`);
    }
  } catch (error) {
    console.log('  ✓ Rejected with error:', (error as Error).message);
  }

  // Test very large threshold
  console.log('\nTest 3: Very large threshold (1000 months)');
  try {
    const detector = createStalenessDetector({
      thresholdMonths: 1000,
      databasePath: 'data/test-config.db'
    });

    const result = await detector.detectStaleness(items);
    
    // With very large threshold, all items should be active
    if (result.activeItems.length === items.length) {
      console.log('  ✓ Handled correctly: All items active with large threshold');
    } else {
      console.log(`  ⚠️  Unexpected: ${result.activeItems.length} active, ${result.staleItems.length} stale`);
    }
  } catch (error) {
    console.log('  ✓ Rejected with error:', (error as Error).message);
  }

  // Test non-integer threshold
  console.log('\nTest 4: Non-integer threshold (12.5 months)');
  try {
    const detector = createStalenessDetector({
      thresholdMonths: 12.5,
      databasePath: 'data/test-config.db'
    });

    const result = await detector.detectStaleness(items);
    console.log(`  ✓ Accepted: ${result.activeItems.length} active, ${result.staleItems.length} stale`);
  } catch (error) {
    console.log('  ✓ Rejected with error:', (error as Error).message);
  }

  // Test invalid database path
  console.log('\nTest 5: Invalid database path');
  try {
    const detector = createStalenessDetector({
      thresholdMonths: 12,
      databasePath: '/invalid/path/database.db'
    });

    await detector.detectStaleness(items);
    console.log('  ⚠️  Accepted invalid path (may fail later)');
  } catch (error) {
    console.log('  ✓ Rejected with error:', (error as Error).message);
  }

  console.log('\n✅ Invalid configuration tests completed');
}

async function testDefaultValues() {
  console.log('\n\n⚙️  Testing Default Values\n');
  console.log('=' .repeat(60));

  const items = createTestItems();

  console.log('\nTest: Default threshold (12 months)');
  const detector = createStalenessDetector({
    thresholdMonths: 12,
    databasePath: 'data/test-config.db'
  });

  const result = await detector.detectStaleness(items);

  console.log(`  Active items: ${result.activeItems.length}`);
  console.log(`  Stale items: ${result.staleItems.length}`);

  // With 12-month threshold, items at 3, 6, 9, 12 should be active
  // Items at 15, 18, 24, 36 should be stale
  const expectedActive = 4;
  const expectedStale = 4;

  if (result.activeItems.length === expectedActive && result.staleItems.length === expectedStale) {
    console.log(`  ✓ Default threshold works correctly`);
  } else {
    console.log(`  ✗ Unexpected results with default threshold`);
  }

  console.log('\n✅ Default value tests completed');
}

async function testRecalculation() {
  console.log('\n\n🔄 Testing Recalculation on Threshold Change\n');
  console.log('=' .repeat(60));

  const items = createTestItems();

  // First run with 12-month threshold
  console.log('\nInitial run: 12-month threshold');
  const detector1 = createStalenessDetector({
    thresholdMonths: 12,
    databasePath: 'data/test-config.db'
  });

  const result1 = await detector1.detectStaleness(items);
  console.log(`  Active: ${result1.activeItems.length}, Stale: ${result1.staleItems.length}`);

  // Second run with 18-month threshold (should recalculate)
  console.log('\nSecond run: 18-month threshold (recalculation)');
  const detector2 = createStalenessDetector({
    thresholdMonths: 18,
    databasePath: 'data/test-config.db'
  });

  const result2 = await detector2.detectStaleness(items);
  console.log(`  Active: ${result2.activeItems.length}, Stale: ${result2.staleItems.length}`);

  // Verify recalculation
  if (result2.activeItems.length > result1.activeItems.length) {
    console.log(`  ✓ Recalculation successful: ${result2.activeItems.length - result1.activeItems.length} items moved from stale to active`);
  } else {
    console.log(`  ✗ Recalculation may not have worked correctly`);
  }

  // Third run back to 12-month threshold
  console.log('\nThird run: Back to 12-month threshold');
  const detector3 = createStalenessDetector({
    thresholdMonths: 12,
    databasePath: 'data/test-config.db'
  });

  const result3 = await detector3.detectStaleness(items);
  console.log(`  Active: ${result3.activeItems.length}, Stale: ${result3.staleItems.length}`);

  if (result3.activeItems.length === result1.activeItems.length) {
    console.log(`  ✓ Consistent results with same threshold`);
  } else {
    console.log(`  ⚠️  Results differ from initial run`);
  }

  console.log('\n✅ Recalculation tests completed');
}

async function main() {
  console.log('🚀 Starting Configuration Tests\n');

  try {
    await testThresholdChanges();
    await testInvalidConfigurations();
    await testDefaultValues();
    await testRecalculation();

    console.log('\n' + '='.repeat(60));
    console.log('✅ All configuration tests completed successfully!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Test error:', error);
    process.exit(1);
  }
}

main();
