#!/usr/bin/env node

/**
 * Main update orchestrator for Le Ghost system
 * Coordinates the entire pipeline: crawl → classify → merge → render
 */

import { getConfigAndData } from './config.js';
import { createCrawler } from './crawl.js';
import { createClassifier } from './classify.js';
import { createMerger } from './merge.js';
import { createRenderer } from './render.js';
import { createDataIntegrityChecker } from './data-integrity.js';
import { createCacheManager } from './cache-manager.js';
import { GhostItem, RepositoryData, ClassificationResult } from './types.js';
import { writeFileSync } from 'fs';
import * as yaml from 'js-yaml';

export interface UpdateOptions {
  dryRun?: boolean;
  skipCrawl?: boolean;
  skipRender?: boolean;
  verbose?: boolean;
  maxItems?: number;
  cacheCleanup?: boolean;
}

/**
 * Result of an update operation
 * Contains statistics, changes, errors, and duration information
 */
export interface UpdateResult {
  /** Whether the update completed successfully */
  success: boolean;
  
  /** Statistics about the update operation */
  stats: {
    /** Number of repositories crawled from GitHub */
    crawled: number;
    /** Number of repositories classified */
    classified: number;
    /** Number of items after merging with existing data */
    merged: number;
    /** Number of items rendered to HTML */
    rendered: number;
    /** Number of GitHub API calls made */
    apiCalls: number;
    /** Number of cache hits (API calls avoided) */
    cacheHits: number;
    /** Number of errors encountered */
    errors: number;
    
    /** Staleness tracking statistics (only present if staleness tracking is enabled) */
    stale?: {
      /** Total number of stale items in database */
      total: number;
      /** Number of items newly detected as stale in this run */
      newlyStale: number;
      /** Number of previously stale items that were reactivated */
      reactivated: number;
      /** Percentage of total items that are stale */
      percentage: number;
      /** Average number of months items have been stale */
      averageMonthsStale: number;
    };
  };
  
  /** Changes made to the dataset */
  changes: {
    /** Number of new items added */
    added: number;
    /** Number of existing items updated */
    updated: number;
    /** Number of items removed */
    removed: number;
  };
  
  /** Array of error messages encountered during the update */
  errors: string[];
  
  /** Duration of the update operation in milliseconds */
  duration: number;
}

/**
 * Main update orchestrator class
 */
export class UpdateOrchestrator {
  private options: UpdateOptions;
  private startTime: number = 0;
  private errors: string[] = [];

  constructor(options: UpdateOptions = {}) {
    this.options = {
      dryRun: false,
      skipCrawl: false,
      skipRender: false,
      verbose: false,
      cacheCleanup: false,
      ...options
    };
  }

  /**
   * Log message with timestamp
   */
  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
    
    if (this.options.verbose || level !== 'info') {
      console.log(`[${timestamp}] ${prefix} ${message}`);
    }
  }

  /**
   * Convert RepositoryData and ClassificationResult to GhostItem
   */
  private convertToGhostItem(repo: RepositoryData, classification: ClassificationResult): GhostItem {
    // Determine category based on repository characteristics
    let category = 'Theme'; // Default category
    
    if (repo.owner?.login?.toLowerCase() === 'tryghost') {
      category = 'Official';
    } else if (repo.name.toLowerCase().includes('tool') || 
               repo.description?.toLowerCase().includes('tool') ||
               repo.topics?.some(topic => topic.includes('tool'))) {
      category = 'Tool';
    } else if (repo.name.toLowerCase().includes('starter') || 
               repo.description?.toLowerCase().includes('starter') ||
               repo.topics?.some(topic => topic.includes('starter'))) {
      category = 'Starter';
    }

    return {
      id: repo.full_name,
      name: repo.name,
      repo: repo.full_name,
      url: repo.html_url,
      description: repo.description,
      category,
      tags: [...(repo.topics || []), 'ghost-theme'],
      stars: repo.stargazers_count,
      pushedAt: repo.pushed_at,
      archived: repo.archived,
      fork: repo.fork,
      license: repo.license?.key || null,
      topics: repo.topics || [],
      score: classification.score,
      confidence: classification.confidence,
      notes: null,
      hidden: false
    };
  }

  /**
   * Execute the complete update pipeline
   */
  async execute(): Promise<UpdateResult> {
    this.startTime = Date.now();
    this.errors = [];

    this.log('🚀 Starting Le Ghost update pipeline');

    const result: UpdateResult = {
      success: false,
      stats: {
        crawled: 0,
        classified: 0,
        merged: 0,
        rendered: 0,
        apiCalls: 0,
        cacheHits: 0,
        errors: 0
      },
      changes: {
        added: 0,
        updated: 0,
        removed: 0
      },
      errors: [],
      duration: 0
    };

    try {
      // Step 1: Load configuration and validate environment
      this.log('📋 Loading configuration and validating environment');
      const { config, data } = getConfigAndData();
      this.log(`✓ Configuration loaded successfully`);
      this.log(`✓ Found ${data.sources.length} search queries`);
      this.log(`✓ Found ${data.items.length} existing items`);
      this.log(`✓ Found ${data.overrides.length} overrides`);

      // Step 2: Cache management
      if (this.options.cacheCleanup) {
        this.log('🧹 Cleaning up expired cache entries');
        const cacheManager = createCacheManager(config.crawler.cache.directory, config.crawler.cache.ttl);
        const cleanupResult = cacheManager.cleanup();
        this.log(`✓ Cleaned up ${cleanupResult.deletedFiles} expired cache files (${this.formatBytes(cleanupResult.freedSpace)} freed)`);
      }

      // Step 3: Repository discovery (crawling)
      let discoveredRepos: RepositoryData[] = [];
      let crawler: any;
      if (!this.options.skipCrawl) {
        this.log('🔍 Starting repository discovery');
        crawler = createCrawler({
          token: config.github.token,
          rateLimit: config.crawler.rateLimit,
          cache: config.crawler.cache
        });

        const crawlResult = await crawler.crawl(data.sources);
        discoveredRepos = crawlResult.repositories;
        
        result.stats.crawled = discoveredRepos.length;
        result.stats.apiCalls = crawlResult.apiCallsUsed;
        result.stats.cacheHits = crawlResult.cacheHits;
        
        this.log(`✓ Discovered ${discoveredRepos.length} repositories`);
        this.log(`✓ API calls used: ${crawlResult.apiCallsUsed}, Cache hits: ${crawlResult.cacheHits}`);
        
        if (crawlResult.errors.length > 0) {
          this.log(`⚠️ ${crawlResult.errors.length} crawling errors occurred`, 'warn');
          this.errors.push(...crawlResult.errors);
        }
      } else {
        this.log('⏭️ Skipping repository discovery (--skip-crawl)');
        // Create a dummy crawler for the classifier
        crawler = createCrawler({
          token: config.github.token,
          rateLimit: config.crawler.rateLimit,
          cache: config.crawler.cache
        });
      }

      // Step 4: Classification
      this.log('🏷️ Starting repository classification');
      const classificationConfig = {
        ...config.classification,
        ghostKeywords: [
          'ghost', 'ghost-theme', 'ghost-cms', 'ghostcms', 'ghost-blog', 'ghost-template'
        ],
        themeKeywords: [
          'theme', 'template', 'handlebars', 'hbs', 'blog', 'website', 'cms'
        ],
        penaltyKeywords: [
          'fork', 'archived', 'deprecated', 'unmaintained'
        ]
      };
      const classifier = createClassifier(crawler.client, classificationConfig);
      
      const classifiedItems: GhostItem[] = [];
      for (const repo of discoveredRepos) {
        try {
          const classification = await classifier.classify(repo);
          const item = this.convertToGhostItem(repo, classification);
          classifiedItems.push(item);
          result.stats.classified++;
        } catch (error) {
          const errorMsg = `Classification failed for ${repo.full_name}: ${error instanceof Error ? error.message : String(error)}`;
          this.log(errorMsg, 'error');
          this.errors.push(errorMsg);
          result.stats.errors++;
        }
      }

      this.log(`✓ Classified ${classifiedItems.length} repositories`);

      // Step 5: Data integrity check
      this.log('🔍 Checking data integrity');
      const integrityChecker = createDataIntegrityChecker();
      const { cleanedItems, duplicateReport, consistencyReport } = integrityChecker.cleanDataset(classifiedItems);
      
      if (duplicateReport.totalDuplicates > 0) {
        this.log(`⚠️ Found and merged ${duplicateReport.totalDuplicates} duplicate entries`, 'warn');
      }
      
      if (!consistencyReport.valid) {
        this.log(`⚠️ Data consistency issues found: ${consistencyReport.errors.length} errors, ${consistencyReport.warnings.length} warnings`, 'warn');
        this.errors.push(...consistencyReport.errors);
      }

      // Step 6: Data merging
      this.log('🔄 Merging new data with existing items');
      const merger = createMerger();
      const mergeResult = merger.mergeData(data.items, cleanedItems, data.overrides, data.ignoreRules);
      
      result.stats.merged = mergeResult.items.length;
      result.changes.added = mergeResult.stats.added;
      result.changes.updated = mergeResult.stats.updated;
      result.changes.removed = mergeResult.stats.removed;

      this.log(`✓ Merged data: ${mergeResult.stats.added} added, ${mergeResult.stats.updated} updated, ${mergeResult.stats.removed} removed`);
      this.log(`✓ Final dataset: ${mergeResult.items.length} items`);

      /**
       * Step 6.5: Staleness Detection and Database Management
       * 
       * This step identifies items that haven't been updated within the configured
       * staleness threshold and manages them in a separate database and HTML page.
       * 
       * Process:
       * 1. Detect stale items by comparing pushedAt dates against threshold
       * 2. Check for reactivated items (previously stale, now active)
       * 3. Update merge result to only include active items
       * 4. Create database backup before modifications
       * 5. Validate database integrity
       * 6. Insert/update stale items in database
       * 7. Remove reactivated items from database
       * 8. Render stale items HTML page with statistics
       * 
       * **Validates: Requirements 1.1-1.5, 2.1-2.6, 3.1-3.7, 4.1-4.5, 5.1-5.5, 8.1-8.5**
       */
      let stalenessStats: any = null;
      if (config.staleness.enabled) {
        try {
          this.log('🕐 Detecting stale items');
          
          // Import staleness modules
          const { createStalenessDetector } = await import('./stale-detector.js');
          const { createStaleDatabaseManager } = await import('./stale-database.js');
          const { createStaleRenderer } = await import('./stale-renderer.js');
          
          // Create staleness detector
          const stalenessDetector = createStalenessDetector({
            thresholdMonths: config.staleness.thresholdMonths,
            databasePath: config.staleness.databasePath
          });
          
          // Detect staleness
          const stalenessResult = await stalenessDetector.detectStaleness(mergeResult.items);
          
          this.log(`✓ Staleness detection: ${stalenessResult.stats.activeCount} active, ${stalenessResult.stats.newlyStale} newly stale, ${stalenessResult.stats.reactivated} reactivated`);
          
          // Update merge result to only include active items
          mergeResult.items = stalenessResult.activeItems;
          
          // Initialize database manager
          const dbManager = createStaleDatabaseManager(config.staleness.databasePath);
          await dbManager.initialize();
          
          try {
            // Create database backup before modifications
            if (!this.options.dryRun) {
              try {
                const backupPath = await dbManager.backup();
                this.log(`✓ Database backup created: ${backupPath}`);
              } catch (error) {
                this.log(`⚠️ Failed to create database backup: ${error instanceof Error ? error.message : String(error)}`, 'warn');
              }
            }
            
            // Validate database integrity
            const integrityResult = await dbManager.validateIntegrity();
            if (!integrityResult.valid) {
              this.log(`⚠️ Database integrity issues found: ${integrityResult.errors.join(', ')}`, 'warn');
              this.errors.push(...integrityResult.errors);
            }
            
            // Insert/update newly stale items
            if (!this.options.dryRun) {
              for (const staleItem of stalenessResult.staleItems) {
                await dbManager.upsertStaleItem(staleItem);
              }
              this.log(`✓ Updated ${stalenessResult.staleItems.length} stale items in database`);
            }
            
            // Remove reactivated items from database
            if (!this.options.dryRun) {
              for (const reactivatedItem of stalenessResult.reactivatedItems) {
                await dbManager.removeStaleItem(reactivatedItem.id);
              }
              if (stalenessResult.reactivatedItems.length > 0) {
                this.log(`✓ Removed ${stalenessResult.reactivatedItems.length} reactivated items from database`);
              }
            }
            
            // Render stale items page
            this.log('🎨 Rendering stale items HTML');
            const allStaleItems = await dbManager.getAllStaleItems();
            const staleRenderer = createStaleRenderer();
            const totalItems = mergeResult.items.length + allStaleItems.length;
            const staleStats = staleRenderer.generateStatistics(allStaleItems, totalItems);
            
            if (!this.options.dryRun) {
              try {
                staleRenderer.renderToFile(
                  config.staleness.renderTemplate,
                  config.staleness.renderOutput,
                  allStaleItems,
                  {
                    title: 'Le Ghost - Not Updated Recently',
                    subtitle: 'Ghost CMS Themes & Tools Not Updated Recently',
                    warningMessage: `These items have not been updated in over ${config.staleness.thresholdMonths} months. They may still work but are not actively maintained.`,
                    thresholdMonths: config.staleness.thresholdMonths,
                    lastUpdate: this.getWorkflowUpdateDate(),
                    statistics: staleStats
                  }
                );
                this.log(`✓ Stale HTML rendered to ${config.staleness.renderOutput}`);
              } catch (error) {
                const errorMsg = `Failed to render stale HTML: ${error instanceof Error ? error.message : String(error)}`;
                this.log(errorMsg, 'error');
                this.errors.push(errorMsg);
                result.stats.errors++;
              }
            } else {
              this.log('⏭️ Skipping stale HTML render (--dry-run)');
            }
            
            // Store statistics for summary
            stalenessStats = {
              total: allStaleItems.length,
              newlyStale: stalenessResult.stats.newlyStale,
              reactivated: stalenessResult.stats.reactivated,
              percentage: staleStats.percentageOfTotal,
              averageMonthsStale: staleStats.averageMonthsStale
            };
            
            result.stats.stale = stalenessStats;
            
          } finally {
            // Clean up database connection
            dbManager.close();
          }
        } catch (error) {
          const errorMsg = `Staleness detection failed: ${error instanceof Error ? error.message : String(error)}`;
          this.log(errorMsg, 'error');
          this.errors.push(errorMsg);
          result.stats.errors++;
          // Continue with pipeline - don't let staleness detection failure break the main pipeline
        }
      } else {
        this.log('⏭️ Staleness detection disabled in configuration');
      }

      // Step 7: Save updated data
      if (!this.options.dryRun) {
        this.log('💾 Saving updated items data');
        const itemsYaml = yaml.dump(mergeResult.items, { indent: 2, lineWidth: 120 });
        writeFileSync('data/items.yml', itemsYaml, 'utf-8');
        this.log('✓ Updated items.yml saved');
      } else {
        this.log('⏭️ Skipping data save (--dry-run)');
      }

      // Step 8: HTML rendering
      if (!this.options.skipRender) {
        this.log('🎨 Rendering HTML output');
        const renderer = createRenderer();
        
        const updateMessage = this.generateUpdateMessage(result.changes);
        
        // Get workflow update date from environment variable or use current date
        const workflowUpdateDate = this.getWorkflowUpdateDate();
        this.log(`📅 Using update date: ${workflowUpdateDate}`);
        
        if (!this.options.dryRun) {
          renderer.renderToFile(
            config.rendering.template,
            config.rendering.output,
            mergeResult.items,
            {
              title: 'Le Ghost - Ghost CMS Themes & Tools Directory',
              subtitle: 'Ghost CMS Themes & Tools Directory (2022–2026)',
              updateMessage,
              lastUpdate: workflowUpdateDate
            }
          );
          this.log(`✓ HTML rendered to ${config.rendering.output}`);
        } else {
          this.log('⏭️ Skipping HTML render (--dry-run)');
        }
        
        result.stats.rendered = mergeResult.items.filter(item => !item.hidden).length;
      } else {
        this.log('⏭️ Skipping HTML rendering (--skip-render)');
      }

      // Step 9: Generate summary
      const summary = this.generateSummary(result);
      this.log('📊 Update Summary:');
      console.log(summary);

      result.success = result.stats.errors === 0;
      result.errors = this.errors;
      result.duration = Date.now() - this.startTime;

      if (result.success) {
        this.log('✅ Update pipeline completed successfully');
      } else {
        this.log(`⚠️ Update pipeline completed with ${result.stats.errors} errors`, 'warn');
      }

    } catch (error) {
      const errorMsg = `Pipeline failed: ${error instanceof Error ? error.message : String(error)}`;
      this.log(errorMsg, 'error');
      this.errors.push(errorMsg);
      result.success = false;
      result.errors = this.errors;
      result.duration = Date.now() - this.startTime;
    }

    return result;
  }

  /**
   * Generate update message for HTML
   */
  private generateUpdateMessage(changes: UpdateResult['changes']): string {
    const parts = [];
    
    if (changes.added > 0) {
      parts.push(`${changes.added} new themes discovered`);
    }
    
    if (changes.updated > 0) {
      parts.push(`${changes.updated} themes updated`);
    }
    
    if (changes.removed > 0) {
      parts.push(`${changes.removed} themes removed`);
    }

    if (parts.length === 0) {
      return 'No changes detected in this update.';
    }

    return `Automated update: ${parts.join(', ')}.`;
  }

  /**
   * Generate human-readable summary
   */
  private generateSummary(result: UpdateResult): string {
    const duration = this.formatDuration(result.duration);
    
    let summary = `
┌─────────────────────────────────────────┐
│           Le Ghost Update Summary        │
├─────────────────────────────────────────┤
│ Status: ${result.success ? '✅ Success' : '❌ Failed'}                      │
│ Duration: ${duration.padEnd(29)} │
├─────────────────────────────────────────┤
│ Repositories crawled: ${String(result.stats.crawled).padStart(13)} │
│ Items classified: ${String(result.stats.classified).padStart(17)} │
│ Items merged: ${String(result.stats.merged).padStart(21)} │
│ Items rendered: ${String(result.stats.rendered).padStart(19)} │
├─────────────────────────────────────────┤
│ Added: ${String(result.changes.added).padStart(28)} │
│ Updated: ${String(result.changes.updated).padStart(26)} │
│ Removed: ${String(result.changes.removed).padStart(26)} │
├─────────────────────────────────────────┤
│ API calls: ${String(result.stats.apiCalls).padStart(24)} │
│ Cache hits: ${String(result.stats.cacheHits).padStart(23)} │
│ Errors: ${String(result.stats.errors).padStart(27)} │`;

    // Add staleness statistics if available
    if (result.stats.stale) {
      summary += `
├─────────────────────────────────────────┤
│ Stale items total: ${String(result.stats.stale.total).padStart(16)} │
│ Newly stale: ${String(result.stats.stale.newlyStale).padStart(22)} │
│ Reactivated: ${String(result.stats.stale.reactivated).padStart(22)} │
│ Stale percentage: ${String(result.stats.stale.percentage).padStart(17)}% │
│ Avg months stale: ${String(result.stats.stale.averageMonthsStale).padStart(17)} │`;
    }

    summary += `
└─────────────────────────────────────────┘`;

    if (result.errors.length > 0) {
      summary += '\n\nErrors:\n';
      for (const error of result.errors.slice(0, 5)) {
        summary += `  • ${error}\n`;
      }
      if (result.errors.length > 5) {
        summary += `  ... and ${result.errors.length - 5} more errors\n`;
      }
    }

    return summary;
  }

  /**
   * Format duration in human readable format
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }

  /**
   * Get workflow update date from environment variable or generate current date
   */
  private getWorkflowUpdateDate(): string {
    // Try to get date from environment variable (set by GitHub Actions workflow)
    const envDate = process.env.WORKFLOW_UPDATE_DATE;
    
    let dateToFormat: Date;
    
    if (envDate && envDate.trim() !== '') {
      // If it's an ISO string, format it
      try {
        const parsedDate = new Date(envDate);
        if (!isNaN(parsedDate.getTime())) {
          dateToFormat = parsedDate;
        } else {
          dateToFormat = new Date();
          this.log(`⚠️ Invalid WORKFLOW_UPDATE_DATE format: ${envDate}, using current date`, 'warn');
        }
      } catch (error) {
        dateToFormat = new Date();
        this.log(`⚠️ Failed to parse WORKFLOW_UPDATE_DATE: ${envDate}, using current date`, 'warn');
      }
    } else {
      dateToFormat = new Date();
    }
    
    // Format date consistently: "Month Day, Year at HH:MM UTC"
    const year = dateToFormat.getUTCFullYear();
    const month = dateToFormat.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
    const day = dateToFormat.getUTCDate();
    const hours = String(dateToFormat.getUTCHours()).padStart(2, '0');
    const minutes = String(dateToFormat.getUTCMinutes()).padStart(2, '0');
    
    return `${month} ${day}, ${year} at ${hours}:${minutes} UTC`;
  }

  /**
   * Format bytes in human readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);
  
  const options: UpdateOptions = {
    dryRun: args.includes('--dry-run'),
    skipCrawl: args.includes('--skip-crawl'),
    skipRender: args.includes('--skip-render'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    cacheCleanup: args.includes('--cleanup-cache')
  };

  // Handle help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Le Ghost Update Pipeline

Usage: npm run update [options]

Options:
  --dry-run         Run without making changes to files
  --skip-crawl      Skip repository discovery phase
  --skip-render     Skip HTML rendering phase
  --cleanup-cache   Clean up expired cache entries before running
  --verbose, -v     Enable verbose logging
  --help, -h        Show this help message

Examples:
  npm run update                    # Full update
  npm run update --dry-run          # Test run without changes
  npm run update --skip-crawl       # Only process existing data
  npm run update --verbose          # Detailed logging
`);
    process.exit(0);
  }

  try {
    const orchestrator = new UpdateOrchestrator(options);
    const result = await orchestrator.execute();
    
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('❌ Fatal error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}` || 
    import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
    process.argv[1].includes('update.js') ||
    process.argv[1].includes('update.ts')) {
  main().catch(console.error);
}