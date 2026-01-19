/**
 * Stale Database Manager
 * 
 * Manages SQLite database operations for storing and retrieving stale items.
 * Handles database initialization, CRUD operations, backups, and integrity validation.
 */

import Database from 'better-sqlite3';
import { StaleItem } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Statistics about stale items in the database
 */
export interface StaleStatistics {
  totalStale: number;
  byCategory: Record<string, number>;
  averageMonthsStale: number;
}

/**
 * Result of database integrity validation
 */
export interface IntegrityValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Database record representation (SQLite format with JSON strings and integer booleans)
 */
interface StaleItemRecord {
  id: string;
  name: string;
  repo: string;
  url: string;
  description: string | null;
  category: string;
  tags: string;            // JSON stringified array
  stars: number;
  pushedAt: string;
  archived: number;        // SQLite boolean (0/1)
  fork: number;            // SQLite boolean (0/1)
  license: string | null;
  topics: string;          // JSON stringified array
  score: number;
  confidence: string;
  notes: string | null;
  hidden: number;          // SQLite boolean (0/1)
  staleDetectedAt: string;
  monthsStale: number;
}

/**
 * Manages SQLite database for stale items tracking
 * 
 * @example
 * ```typescript
 * // Create and initialize database manager
 * const dbManager = new StaleDatabaseManager('data/stale-items.db');
 * await dbManager.initialize();
 * 
 * try {
 *   // Create backup before modifications
 *   const backupPath = await dbManager.backup();
 *   console.log(`Backup created: ${backupPath}`);
 *   
 *   // Validate database integrity
 *   const validation = await dbManager.validateIntegrity();
 *   if (!validation.valid) {
 *     console.error('Integrity errors:', validation.errors);
 *   }
 *   
 *   // Insert or update a stale item
 *   await dbManager.upsertStaleItem(staleItem);
 *   
 *   // Get all stale items
 *   const allStale = await dbManager.getAllStaleItems();
 *   
 *   // Get statistics
 *   const stats = await dbManager.getStatistics();
 *   console.log(`Total stale: ${stats.totalStale}`);
 *   console.log(`Average months stale: ${stats.averageMonthsStale}`);
 *   
 *   // Remove reactivated item
 *   await dbManager.removeStaleItem('owner/repo');
 * } finally {
 *   // Always close the connection
 *   dbManager.close();
 * }
 * ```
 */
export class StaleDatabaseManager {
  private db: Database.Database | null = null;
  private databasePath: string;

  /**
   * Create a new StaleDatabaseManager
   * @param databasePath Path to the SQLite database file
   */
  constructor(databasePath: string) {
    this.databasePath = databasePath;
  }

  /**
   * Initialize database connection and create schema if needed
   * Creates the database file and tables if they don't exist
   */
  async initialize(): Promise<void> {
    // Ensure the directory exists
    const dir = path.dirname(this.databasePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Open database connection
    this.db = new Database(this.databasePath);

    // Create schema
    this.createSchema();
  }

  /**
   * Create database schema with proper indexes
   * @private
   */
  private createSchema(): void {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    // Create stale_items table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stale_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        repo TEXT NOT NULL,
        url TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        tags TEXT NOT NULL,
        stars INTEGER NOT NULL,
        pushedAt TEXT NOT NULL,
        archived INTEGER NOT NULL,
        fork INTEGER NOT NULL,
        license TEXT,
        topics TEXT NOT NULL,
        score INTEGER NOT NULL,
        confidence TEXT NOT NULL,
        notes TEXT,
        hidden INTEGER NOT NULL,
        staleDetectedAt TEXT NOT NULL,
        monthsStale INTEGER NOT NULL,
        UNIQUE(id)
      );
    `);

    // Create indexes for efficient queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_category ON stale_items(category);
      CREATE INDEX IF NOT EXISTS idx_staleDetectedAt ON stale_items(staleDetectedAt);
      CREATE INDEX IF NOT EXISTS idx_monthsStale ON stale_items(monthsStale);
    `);
  }

  /**
   * Convert StaleItem to database record format
   * @private
   */
  private toDbRecord(item: StaleItem): StaleItemRecord {
    return {
      id: item.id,
      name: item.name,
      repo: item.repo,
      url: item.url,
      description: item.description,
      category: item.category,
      tags: JSON.stringify(item.tags),
      stars: item.stars,
      pushedAt: item.pushedAt,
      archived: item.archived ? 1 : 0,
      fork: item.fork ? 1 : 0,
      license: item.license,
      topics: JSON.stringify(item.topics),
      score: item.score,
      confidence: item.confidence,
      notes: item.notes,
      hidden: item.hidden ? 1 : 0,
      staleDetectedAt: item.staleDetectedAt,
      monthsStale: item.monthsStale,
    };
  }

  /**
   * Convert database record to StaleItem format
   * @private
   */
  private fromDbRecord(record: StaleItemRecord): StaleItem {
    return {
      id: record.id,
      name: record.name,
      repo: record.repo,
      url: record.url,
      description: record.description,
      category: record.category,
      tags: JSON.parse(record.tags),
      stars: record.stars,
      pushedAt: record.pushedAt,
      archived: record.archived === 1,
      fork: record.fork === 1,
      license: record.license,
      topics: JSON.parse(record.topics),
      score: record.score,
      confidence: record.confidence as 'high' | 'medium' | 'low',
      notes: record.notes,
      hidden: record.hidden === 1,
      staleDetectedAt: record.staleDetectedAt,
      monthsStale: record.monthsStale,
    };
  }

  /**
   * Insert or update a stale item in the database
   * @param item The stale item to upsert
   */
  async upsertStaleItem(item: StaleItem): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const record = this.toDbRecord(item);

    const stmt = this.db.prepare(`
      INSERT INTO stale_items (
        id, name, repo, url, description, category, tags, stars, pushedAt,
        archived, fork, license, topics, score, confidence, notes, hidden,
        staleDetectedAt, monthsStale
      ) VALUES (
        @id, @name, @repo, @url, @description, @category, @tags, @stars, @pushedAt,
        @archived, @fork, @license, @topics, @score, @confidence, @notes, @hidden,
        @staleDetectedAt, @monthsStale
      )
      ON CONFLICT(id) DO UPDATE SET
        name = @name,
        repo = @repo,
        url = @url,
        description = @description,
        category = @category,
        tags = @tags,
        stars = @stars,
        pushedAt = @pushedAt,
        archived = @archived,
        fork = @fork,
        license = @license,
        topics = @topics,
        score = @score,
        confidence = @confidence,
        notes = @notes,
        hidden = @hidden,
        staleDetectedAt = @staleDetectedAt,
        monthsStale = @monthsStale
    `);

    stmt.run(record);
  }

  /**
   * Get all stale items from the database
   * @returns Array of all stale items
   */
  async getAllStaleItems(): Promise<StaleItem[]> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const stmt = this.db.prepare('SELECT * FROM stale_items ORDER BY category, stars DESC');
    const records = stmt.all() as StaleItemRecord[];

    return records.map(record => this.fromDbRecord(record));
  }

  /**
   * Remove a stale item from the database (used during reactivation)
   * @param itemId The ID of the item to remove
   */
  async removeStaleItem(itemId: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const stmt = this.db.prepare('DELETE FROM stale_items WHERE id = ?');
    stmt.run(itemId);
  }

  /**
   * Get stale items filtered by category
   * @param category The category to filter by
   * @returns Array of stale items in the specified category
   */
  async getStaleItemsByCategory(category: string): Promise<StaleItem[]> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const stmt = this.db.prepare('SELECT * FROM stale_items WHERE category = ? ORDER BY stars DESC');
    const records = stmt.all(category) as StaleItemRecord[];

    return records.map(record => this.fromDbRecord(record));
  }

  /**
   * Get statistics about stale items
   * @returns Statistics including total count, breakdown by category, and average staleness
   */
  async getStatistics(): Promise<StaleStatistics> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    // Get total count
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM stale_items');
    const totalResult = totalStmt.get() as { count: number };
    const totalStale = totalResult.count;

    // Get count by category
    const categoryStmt = this.db.prepare('SELECT category, COUNT(*) as count FROM stale_items GROUP BY category');
    const categoryResults = categoryStmt.all() as Array<{ category: string; count: number }>;
    const byCategory: Record<string, number> = {};
    for (const result of categoryResults) {
      byCategory[result.category] = result.count;
    }

    // Get average months stale
    const avgStmt = this.db.prepare('SELECT AVG(monthsStale) as avg FROM stale_items');
    const avgResult = avgStmt.get() as { avg: number | null };
    const averageMonthsStale = avgResult.avg ?? 0;

    return {
      totalStale,
      byCategory,
      averageMonthsStale: Math.round(averageMonthsStale * 10) / 10, // Round to 1 decimal place
    };
  }

  /**
   * Create a backup of the database file
   * @returns Path to the backup file
   */
  async backup(): Promise<string> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    // Close the database temporarily to ensure all data is flushed
    const wasOpen = this.db !== null;
    if (wasOpen) {
      this.db.close();
    }

    // Create backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = this.databasePath.replace(/\.db$/, `.backup-${timestamp}.db`);

    // Copy the database file
    fs.copyFileSync(this.databasePath, backupPath);

    // Reopen the database if it was open
    if (wasOpen) {
      this.db = new Database(this.databasePath);
    }

    return backupPath;
  }

  /**
   * Validate database integrity
   * Checks for schema correctness, data consistency, and corruption
   * @returns Validation result with any errors found
   */
  async validateIntegrity(): Promise<IntegrityValidationResult> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    const errors: string[] = [];

    try {
      // Run SQLite integrity check
      const integrityStmt = this.db.prepare('PRAGMA integrity_check');
      const integrityResult = integrityStmt.get() as { integrity_check: string };
      if (integrityResult.integrity_check !== 'ok') {
        errors.push(`SQLite integrity check failed: ${integrityResult.integrity_check}`);
      }

      // Check that all required columns exist
      const tableInfoStmt = this.db.prepare('PRAGMA table_info(stale_items)');
      const columns = tableInfoStmt.all() as Array<{ name: string }>;
      const columnNames = columns.map(col => col.name);

      const requiredColumns = [
        'id', 'name', 'repo', 'url', 'description', 'category', 'tags', 'stars',
        'pushedAt', 'archived', 'fork', 'license', 'topics', 'score', 'confidence',
        'notes', 'hidden', 'staleDetectedAt', 'monthsStale'
      ];

      for (const requiredCol of requiredColumns) {
        if (!columnNames.includes(requiredCol)) {
          errors.push(`Missing required column: ${requiredCol}`);
        }
      }

      // Check that all indexes exist
      const indexStmt = this.db.prepare('PRAGMA index_list(stale_items)');
      const indexes = indexStmt.all() as Array<{ name: string }>;
      const indexNames = indexes.map(idx => idx.name);

      const requiredIndexes = ['idx_category', 'idx_staleDetectedAt', 'idx_monthsStale'];
      for (const requiredIdx of requiredIndexes) {
        if (!indexNames.includes(requiredIdx)) {
          errors.push(`Missing required index: ${requiredIdx}`);
        }
      }

      // Validate data consistency - check for invalid JSON in tags and topics
      const allItemsStmt = this.db.prepare('SELECT id, tags, topics FROM stale_items');
      const items = allItemsStmt.all() as Array<{ id: string; tags: string; topics: string }>;

      for (const item of items) {
        try {
          JSON.parse(item.tags);
        } catch (e) {
          errors.push(`Invalid JSON in tags for item ${item.id}`);
        }

        try {
          JSON.parse(item.topics);
        } catch (e) {
          errors.push(`Invalid JSON in topics for item ${item.id}`);
        }
      }

      // Check for negative values in numeric fields
      const negativeStmt = this.db.prepare('SELECT id FROM stale_items WHERE stars < 0 OR score < 0 OR monthsStale < 0');
      const negativeItems = negativeStmt.all() as Array<{ id: string }>;
      if (negativeItems.length > 0) {
        errors.push(`Found ${negativeItems.length} items with negative numeric values`);
      }

    } catch (error) {
      errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

/**
 * Factory function to create a StaleDatabaseManager instance
 * @param databasePath Path to the SQLite database file
 * @returns A new StaleDatabaseManager instance
 */
export function createStaleDatabaseManager(databasePath: string): StaleDatabaseManager {
  return new StaleDatabaseManager(databasePath);
}
