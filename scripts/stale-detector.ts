/**
 * Staleness detection module for Le Ghost system
 * Determines which items are stale based on their last update date
 */

import { GhostItem, StaleItem } from './types.js';

/**
 * Configuration for staleness detection
 */
export interface StalenessConfig {
  thresholdMonths: number;  // Number of months without updates to be considered stale
  databasePath: string;     // Path to SQLite database file
}

/**
 * Result of staleness detection operation
 */
export interface StalenessResult {
  activeItems: GhostItem[];        // Items within threshold
  staleItems: StaleItem[];         // Items beyond threshold (newly detected)
  reactivatedItems: GhostItem[];   // Previously stale items now active
  stats: {
    totalProcessed: number;
    activeCount: number;
    newlyStale: number;
    reactivated: number;
    remainingStale: number;
  };
}

/**
 * StalenessDetector class
 * Analyzes items and determines staleness based on configured threshold
 * 
 * @example
 * ```typescript
 * // Create a detector with 12-month threshold
 * const detector = new StalenessDetector({
 *   thresholdMonths: 12,
 *   databasePath: 'data/stale-items.db'
 * });
 * 
 * // Check if a single item is stale
 * const isStale = detector.isStale(item);
 * 
 * // Analyze all items and get categorized results
 * const result = await detector.detectStaleness(items);
 * console.log(`Active: ${result.stats.activeCount}`);
 * console.log(`Newly stale: ${result.stats.newlyStale}`);
 * console.log(`Reactivated: ${result.stats.reactivated}`);
 * ```
 */
export class StalenessDetector {
  private config: StalenessConfig;

  /**
   * Create a new StalenessDetector
   * @param config - Staleness configuration with threshold and database path
   */
  constructor(config: StalenessConfig) {
    this.config = config;
  }

  /**
   * Check if an item is stale based on the configured threshold
   * @param item - The GhostItem to check
   * @returns true if the item is stale, false otherwise
   * 
   * An item is considered stale if its pushedAt date is older than
   * the current date minus the threshold months.
   * 
   * **Note**: Official items (category === 'Official') are never considered stale
   * as they are maintained by TryGhost and should always appear in the main directory.
   */
  isStale(item: GhostItem): boolean {
    // Official items are never stale
    if (item.category === 'Official') {
      return false;
    }
    
    const monthsStale = this.calculateMonthsStale(item.pushedAt);
    return monthsStale > this.config.thresholdMonths;
  }

  /**
   * Calculate the number of months since an item was last updated
   * @param pushedAt - ISO 8601 timestamp string of the last update
   * @returns Number of months since the last update (non-negative integer)
   * 
   * Uses UTC timestamps for consistency across timezones.
   * Calculates the difference in months by comparing year and month components.
   */
  calculateMonthsStale(pushedAt: string): number {
    const pushedDate = new Date(pushedAt);
    const currentDate = new Date();

    // Convert to UTC to ensure consistent calculations
    const pushedUTC = Date.UTC(
      pushedDate.getUTCFullYear(),
      pushedDate.getUTCMonth(),
      pushedDate.getUTCDate()
    );
    const currentUTC = Date.UTC(
      currentDate.getUTCFullYear(),
      currentDate.getUTCMonth(),
      currentDate.getUTCDate()
    );

    // Calculate difference in months
    const yearsDiff = currentDate.getUTCFullYear() - pushedDate.getUTCFullYear();
    const monthsDiff = currentDate.getUTCMonth() - pushedDate.getUTCMonth();
    
    // Total months difference
    const totalMonths = yearsDiff * 12 + monthsDiff;

    // Ensure non-negative result
    return Math.max(0, totalMonths);
  }

  /**
   * Analyze items and separate into active/stale categories
   * 
   * This method performs the core staleness detection logic:
   * 1. Compares each item's pushedAt date against the staleness threshold
   * 2. Queries the stale database for items that may have been reactivated
   * 3. Separates items into active, newly stale, and reactivated categories
   * 4. Calculates and returns comprehensive statistics
   * 
   * @param items - Array of GhostItems to analyze
   * @returns StalenessResult with categorized items and statistics
   * 
   * **Validates: Requirements 1.1, 1.2, 1.3, 5.1, 5.2**
   */
  async detectStaleness(items: GhostItem[]): Promise<StalenessResult> {
    const { createStaleDatabaseManager } = await import('./stale-database.js');
    
    // Initialize database manager to check for reactivation candidates
    const dbManager = createStaleDatabaseManager(this.config.databasePath);
    await dbManager.initialize();

    try {
      // Get all currently stale items from database
      const existingStaleItems = await dbManager.getAllStaleItems();
      const existingStaleMap = new Map(existingStaleItems.map(item => [item.id, item]));

      // Arrays to hold categorized items
      const activeItems: GhostItem[] = [];
      const newlyStaleItems: StaleItem[] = [];
      const reactivatedItems: GhostItem[] = [];

      // Current timestamp for staleDetectedAt
      const currentDate = new Date();
      const currentTimestamp = currentDate.toISOString();

      // Process each item
      for (const item of items) {
        const itemIsStale = this.isStale(item);
        const wasStale = existingStaleMap.has(item.id);

        if (itemIsStale) {
          // Item is currently stale
          if (wasStale) {
            // Item was already stale - update it in database (handled by caller)
            // We don't add it to newlyStaleItems since it's not "newly" stale
            const existingStaleItem = existingStaleMap.get(item.id)!;
            // Update monthsStale but preserve original staleDetectedAt
            const updatedStaleItem: StaleItem = {
              ...item,
              staleDetectedAt: existingStaleItem.staleDetectedAt,
              monthsStale: this.calculateMonthsStale(item.pushedAt),
            };
            newlyStaleItems.push(updatedStaleItem);
          } else {
            // Item is newly stale
            const staleItem: StaleItem = {
              ...item,
              staleDetectedAt: currentTimestamp,
              monthsStale: this.calculateMonthsStale(item.pushedAt),
            };
            newlyStaleItems.push(staleItem);
          }
          // Remove from existingStaleMap to track what's been processed
          existingStaleMap.delete(item.id);
        } else {
          // Item is currently active
          if (wasStale) {
            // Item was stale but is now active - reactivation!
            console.log(`✓ Reactivated: ${item.name} (${item.id})`);
            reactivatedItems.push(item);
            existingStaleMap.delete(item.id);
          }
          activeItems.push(item);
        }
      }

      // Calculate statistics
      const totalProcessed = items.length;
      const activeCount = activeItems.length;
      
      // Count truly newly stale items (not updates to existing stale items)
      const trulyNewlyStale = newlyStaleItems.filter(item => {
        // Check if this item was in the original existingStaleItems
        return !existingStaleItems.some(existing => existing.id === item.id);
      }).length;
      
      const reactivated = reactivatedItems.length;
      
      // Remaining stale items are those still in the map (not seen in current items)
      const remainingStale = existingStaleMap.size;

      const stats = {
        totalProcessed,
        activeCount,
        newlyStale: trulyNewlyStale,
        reactivated,
        remainingStale,
      };

      return {
        activeItems,
        staleItems: newlyStaleItems,
        reactivatedItems,
        stats,
      };
    } finally {
      // Clean up database connection
      dbManager.close();
    }
  }
}

/**
 * Factory function to create a StalenessDetector instance
 * @param config - Staleness configuration
 * @returns A new StalenessDetector instance
 */
export function createStalenessDetector(config: StalenessConfig): StalenessDetector {
  return new StalenessDetector(config);
}
