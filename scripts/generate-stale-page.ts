#!/usr/bin/env node

/**
 * Manual script to generate stale items page
 * 
 * This script:
 * 1. Reads items from data/items.yml
 * 2. Detects stale items based on threshold
 * 3. Updates the stale items database
 * 4. Generates stale.html
 * 
 * Usage: node dist/generate-stale-page.js
 */

import { readFileSync, writeFileSync } from 'fs';
import * as yaml from 'js-yaml';
import { GhostItem } from './types.js';
import { createStalenessDetector } from './stale-detector.js';
import { createStaleDatabaseManager } from './stale-database.js';
import { createStaleRenderer } from './stale-renderer.js';

const ITEMS_PATH = 'data/items.yml';
const DB_PATH = 'data/stale-items.db';
const TEMPLATE_PATH = 'templates/stale.template.html';
const OUTPUT_PATH = 'stale.html';
const THRESHOLD_MONTHS = 12;

async function main() {
  console.log('🚀 Generating Stale Items Page\n');

  // Step 1: Load items
  console.log('📖 Loading items from', ITEMS_PATH);
  const itemsContent = readFileSync(ITEMS_PATH, 'utf-8');
  const items = yaml.load(itemsContent) as GhostItem[];
  console.log(`  ✓ Loaded ${items.length} items\n`);

  // Step 2: Detect staleness
  console.log('🕐 Detecting stale items (threshold: ' + THRESHOLD_MONTHS + ' months)');
  const detector = createStalenessDetector({
    thresholdMonths: THRESHOLD_MONTHS,
    databasePath: DB_PATH
  });

  const result = await detector.detectStaleness(items);
  console.log(`  ✓ Active items: ${result.activeItems.length}`);
  console.log(`  ✓ Newly stale: ${result.stats.newlyStale}`);
  console.log(`  ✓ Reactivated: ${result.stats.reactivated}`);
  console.log(`  ✓ Total stale: ${result.staleItems.length}\n`);

  // Step 3: Update database
  console.log('💾 Updating stale items database');
  const dbManager = createStaleDatabaseManager(DB_PATH);
  await dbManager.initialize();

  try {
    // Create backup
    try {
      const backupPath = await dbManager.backup();
      console.log(`  ✓ Backup created: ${backupPath}`);
    } catch (error) {
      console.log(`  ⚠️  Backup skipped (database may be empty)`);
    }

    // Validate integrity
    const integrityResult = await dbManager.validateIntegrity();
    if (!integrityResult.valid) {
      console.log(`  ⚠️  Database integrity issues: ${integrityResult.errors.join(', ')}`);
    } else {
      console.log('  ✓ Database integrity validated');
    }

    // Insert/update stale items
    for (const staleItem of result.staleItems) {
      await dbManager.upsertStaleItem(staleItem);
    }
    console.log(`  ✓ Updated ${result.staleItems.length} stale items in database`);

    // Remove reactivated items
    for (const reactivatedItem of result.reactivatedItems) {
      await dbManager.removeStaleItem(reactivatedItem.id);
    }
    if (result.reactivatedItems.length > 0) {
      console.log(`  ✓ Removed ${result.reactivatedItems.length} reactivated items`);
    }

    // Get all stale items from database
    const allStaleItems = await dbManager.getAllStaleItems();
    console.log(`  ✓ Total stale items in database: ${allStaleItems.length}\n`);

    // Step 4: Generate statistics
    console.log('📊 Generating statistics');
    const renderer = createStaleRenderer();
    const totalItems = result.activeItems.length + allStaleItems.length;
    const stats = renderer.generateStatistics(allStaleItems, totalItems);

    console.log(`  ✓ Total stale: ${stats.totalStale}`);
    console.log(`  ✓ Percentage: ${stats.percentageOfTotal}%`);
    console.log(`  ✓ Average months stale: ${stats.averageMonthsStale}`);
    console.log(`  ✓ By category:`, stats.byCategory);
    console.log();

    // Step 5: Render HTML
    console.log('🎨 Rendering stale items HTML');
    renderer.renderToFile(
      TEMPLATE_PATH,
      OUTPUT_PATH,
      allStaleItems,
      {
        title: 'Le Ghost - Not Updated Recently',
        subtitle: 'Ghost CMS Themes & Tools Not Updated Recently',
        warningMessage: `These items have not been updated in over ${THRESHOLD_MONTHS} months. They may still work but are not actively maintained.`,
        thresholdMonths: THRESHOLD_MONTHS,
        statistics: stats
      }
    );
    console.log(`  ✓ HTML rendered to ${OUTPUT_PATH}\n`);

    // Step 6: Update items.yml to only include active items
    console.log('📝 Updating items.yml with active items only');
    const itemsYaml = yaml.dump(result.activeItems, { indent: 2, lineWidth: 120 });
    writeFileSync(ITEMS_PATH, itemsYaml, 'utf-8');
    console.log(`  ✓ Updated ${ITEMS_PATH} with ${result.activeItems.length} active items\n`);

    // Summary
    console.log('✅ Stale items page generated successfully!');
    console.log('\nSummary:');
    console.log(`  • Active items: ${result.activeItems.length}`);
    console.log(`  • Stale items: ${allStaleItems.length}`);
    console.log(`  • Newly stale: ${result.stats.newlyStale}`);
    console.log(`  • Reactivated: ${result.stats.reactivated}`);
    console.log(`  • Database: ${DB_PATH}`);
    console.log(`  • HTML: ${OUTPUT_PATH}`);

  } finally {
    dbManager.close();
  }
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
