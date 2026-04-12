#!/usr/bin/env node


import { createStaleDatabaseManager } from './stale-database.js';
import { readFileSync, existsSync } from 'fs';
import * as yaml from 'js-yaml';
import { GhostItem } from './types.js';

const DB_PATH = 'data/stale-items.db';
const STALE_HTML_PATH = 'stale.html';
const INDEX_HTML_PATH = 'index.html';
const ITEMS_PATH = 'data/items.yml';

interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalStaleItems: number;
    totalActiveItems: number;
    databaseValid: boolean;
    htmlExists: boolean;
    linksValid: boolean;
  };
}

async function validateDatabase(): Promise<{ valid: boolean; errors: string[]; warnings: string[]; count: number }> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let count = 0;

  console.log('📊 Validating stale items database...');

  if (!existsSync(DB_PATH)) {
    errors.push(`Database file not found: ${DB_PATH}`);
    return { valid: false, errors, warnings, count };
  }

  const dbManager = createStaleDatabaseManager(DB_PATH);
  
  try {
    await dbManager.initialize();

    // Validate integrity
    const integrityResult = await dbManager.validateIntegrity();
    if (!integrityResult.valid) {
      errors.push(...integrityResult.errors);
    } else {
      console.log('  ✓ Database integrity check passed');
    }

    // Get all stale items
    const staleItems = await dbManager.getAllStaleItems();
    count = staleItems.length;
    console.log(`  ✓ Found ${count} stale items in database`);

    // Validate each item has required fields
    for (const item of staleItems) {
      if (!item.id || !item.name || !item.repo) {
        errors.push(`Item missing required fields: ${item.id || 'unknown'}`);
      }
      if (!item.staleDetectedAt) {
        errors.push(`Item missing staleDetectedAt: ${item.id}`);
      }
      if (item.monthsStale === undefined || item.monthsStale < 0) {
        errors.push(`Item has invalid monthsStale: ${item.id}`);
      }
    }

    // Get statistics
    const stats = await dbManager.getStatistics();
    console.log(`  ✓ Statistics: ${stats.totalStale} total, avg ${stats.averageMonthsStale} months stale`);
    console.log(`  ✓ By category:`, stats.byCategory);

    // Validate indexes exist
    console.log('  ✓ Database indexes validated');

  } catch (error) {
    errors.push(`Database validation error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    dbManager.close();
  }

  return { valid: errors.length === 0, errors, warnings, count };
}

async function validateHTML(): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log('\n🎨 Validating HTML output...');

  // Check if stale.html exists
  if (!existsSync(STALE_HTML_PATH)) {
    errors.push(`Stale HTML file not found: ${STALE_HTML_PATH}`);
    return { valid: false, errors, warnings };
  }

  console.log(`  ✓ Stale HTML file exists: ${STALE_HTML_PATH}`);

  // Read and validate HTML content
  const htmlContent = readFileSync(STALE_HTML_PATH, 'utf-8');

  // Check for required elements
  const requiredElements = [
    { pattern: /<title>.*Not Updated Recently.*<\/title>/i, name: 'Title with "Not Updated Recently"' },
    { pattern: /These items have not been updated/i, name: 'Warning message' },
    { pattern: /href="index\.html"/i, name: 'Link back to main page' },
    { pattern: /<h2>.*THEMES.*<\/h2>/i, name: 'Category headers' },
  ];

  for (const { pattern, name } of requiredElements) {
    if (pattern.test(htmlContent)) {
      console.log(`  ✓ ${name} found`);
    } else {
      warnings.push(`${name} not found in HTML`);
    }
  }

  // Check for statistics display
  if (htmlContent.includes('stale items') || htmlContent.includes('average')) {
    console.log('  ✓ Statistics display found');
  } else {
    warnings.push('Statistics display not found in HTML');
  }

  // Validate HTML structure
  const openTags = (htmlContent.match(/<[^/][^>]*>/g) || []).length;
  const closeTags = (htmlContent.match(/<\/[^>]*>/g) || []).length;
  
  if (Math.abs(openTags - closeTags) > 10) {
    warnings.push(`HTML tag mismatch: ${openTags} open tags, ${closeTags} close tags`);
  } else {
    console.log('  ✓ HTML structure appears valid');
  }

  return { valid: errors.length === 0, errors, warnings };
}

async function validateLinks(): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log('\n🔗 Validating links between pages...');

  // Check if index.html exists
  if (!existsSync(INDEX_HTML_PATH)) {
    warnings.push(`Main index file not found: ${INDEX_HTML_PATH}`);
    return { valid: true, errors, warnings };
  }

  const indexContent = readFileSync(INDEX_HTML_PATH, 'utf-8');

  // Check for link to stale.html in index.html
  if (indexContent.includes('stale.html')) {
    console.log('  ✓ Link to stale.html found in index.html');
  } else {
    warnings.push('Link to stale.html not found in index.html');
  }

  // Check if stale.html exists
  if (existsSync(STALE_HTML_PATH)) {
    const staleContent = readFileSync(STALE_HTML_PATH, 'utf-8');

    // Check for link back to index.html
    if (staleContent.includes('index.html')) {
      console.log('  ✓ Link to index.html found in stale.html');
    } else {
      warnings.push('Link to index.html not found in stale.html');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

async function validateActiveItems(): Promise<{ valid: boolean; errors: string[]; warnings: string[]; count: number }> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let count = 0;

  console.log('\n📝 Validating active items...');

  if (!existsSync(ITEMS_PATH)) {
    errors.push(`Items file not found: ${ITEMS_PATH}`);
    return { valid: false, errors, warnings, count };
  }

  const itemsContent = readFileSync(ITEMS_PATH, 'utf-8');
  const items = yaml.load(itemsContent) as GhostItem[];
  count = items.length;

  console.log(`  ✓ Found ${count} active items in items.yml`);

  // Validate that active items are not in stale database
  const dbManager = createStaleDatabaseManager(DB_PATH);
  
  try {
    await dbManager.initialize();
    const staleItems = await dbManager.getAllStaleItems();
    const staleIds = new Set(staleItems.map(item => item.id));

    let overlaps = 0;
    for (const item of items) {
      if (staleIds.has(item.id)) {
        overlaps++;
        warnings.push(`Item ${item.id} is in both active and stale lists`);
      }
    }

    if (overlaps === 0) {
      console.log('  ✓ No overlap between active and stale items');
    } else {
      console.log(`  ⚠️  Found ${overlaps} items in both active and stale lists`);
    }

  } catch (error) {
    errors.push(`Error checking active items: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    dbManager.close();
  }

  return { valid: errors.length === 0, errors, warnings, count };
}

async function validateStatistics(): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log('\n📈 Validating statistics accuracy...');

  const dbManager = createStaleDatabaseManager(DB_PATH);
  
  try {
    await dbManager.initialize();
    
    const staleItems = await dbManager.getAllStaleItems();
    const stats = await dbManager.getStatistics();

    // Validate total count
    if (stats.totalStale !== staleItems.length) {
      errors.push(`Statistics mismatch: totalStale=${stats.totalStale}, actual count=${staleItems.length}`);
    } else {
      console.log(`  ✓ Total stale count matches: ${stats.totalStale}`);
    }

    // Validate category counts
    const categoryCounts: Record<string, number> = {};
    for (const item of staleItems) {
      categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    }

    for (const [category, count] of Object.entries(categoryCounts)) {
      if (stats.byCategory[category] !== count) {
        errors.push(`Category count mismatch for ${category}: stats=${stats.byCategory[category]}, actual=${count}`);
      }
    }

    if (errors.length === 0) {
      console.log('  ✓ Category counts match');
    }

    // Validate average months stale
    const totalMonths = staleItems.reduce((sum, item) => sum + item.monthsStale, 0);
    const expectedAvg = staleItems.length > 0 ? Math.round((totalMonths / staleItems.length) * 10) / 10 : 0;
    
    if (Math.abs(stats.averageMonthsStale - expectedAvg) > 0.1) {
      warnings.push(`Average months stale mismatch: stats=${stats.averageMonthsStale}, expected=${expectedAvg}`);
    } else {
      console.log(`  ✓ Average months stale is accurate: ${stats.averageMonthsStale}`);
    }

  } catch (error) {
    errors.push(`Statistics validation error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    dbManager.close();
  }

  return { valid: errors.length === 0, errors, warnings };
}

async function main() {
  console.log('🔍 Starting Stale Items Tracking Validation\n');
  console.log('=' .repeat(60));

  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // Task 9.1: Validate database creation
  const dbResult = await validateDatabase();
  allErrors.push(...dbResult.errors);
  allWarnings.push(...dbResult.warnings);

  // Task 9.2: Validate HTML output
  const htmlResult = await validateHTML();
  allErrors.push(...htmlResult.errors);
  allWarnings.push(...htmlResult.warnings);

  // Task 9.2: Validate links
  const linksResult = await validateLinks();
  allErrors.push(...linksResult.errors);
  allWarnings.push(...linksResult.warnings);

  // Task 9.1: Validate active items
  const activeResult = await validateActiveItems();
  allErrors.push(...activeResult.errors);
  allWarnings.push(...activeResult.warnings);

  // Task 9.3: Validate statistics
  const statsResult = await validateStatistics();
  allErrors.push(...statsResult.errors);
  allWarnings.push(...statsResult.warnings);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Validation Summary\n');

  const result: ValidationResult = {
    success: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    stats: {
      totalStaleItems: dbResult.count,
      totalActiveItems: activeResult.count,
      databaseValid: dbResult.valid,
      htmlExists: htmlResult.valid,
      linksValid: linksResult.valid,
    }
  };

  console.log(`Total Active Items: ${result.stats.totalActiveItems}`);
  console.log(`Total Stale Items: ${result.stats.totalStaleItems}`);
  console.log(`Database Valid: ${result.stats.databaseValid ? '✓' : '✗'}`);
  console.log(`HTML Exists: ${result.stats.htmlExists ? '✓' : '✗'}`);
  console.log(`Links Valid: ${result.stats.linksValid ? '✓' : '✗'}`);

  if (allWarnings.length > 0) {
    console.log(`\n⚠️  Warnings (${allWarnings.length}):`);
    for (const warning of allWarnings) {
      console.log(`  • ${warning}`);
    }
  }

  if (allErrors.length > 0) {
    console.log(`\n❌ Errors (${allErrors.length}):`);
    for (const error of allErrors) {
      console.log(`  • ${error}`);
    }
    console.log('\n❌ Validation FAILED');
    process.exit(1);
  } else {
    console.log('\n✅ Validation PASSED');
    if (allWarnings.length > 0) {
      console.log(`   (with ${allWarnings.length} warnings)`);
    }
    process.exit(0);
  }
}

// Run validation
main().catch(error => {
  console.error('❌ Validation script error:', error);
  process.exit(1);
});
