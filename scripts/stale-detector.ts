
import { GhostItem, StaleItem } from './types.js';

export interface StalenessConfig {
  thresholdMonths: number;
  databasePath: string;
}

export interface StalenessResult {
  activeItems: GhostItem[];
  staleItems: StaleItem[];
  reactivatedItems: GhostItem[];
  stats: {
    totalProcessed: number;
    activeCount: number;
    newlyStale: number;
    reactivated: number;
    remainingStale: number;
  };
}

export class StalenessDetector {
  private config: StalenessConfig;

  constructor(config: StalenessConfig) {
    this.config = config;
  }

  isStale(item: GhostItem): boolean {
    const monthsStale = this.calculateMonthsStale(item.pushedAt);
    return monthsStale > this.config.thresholdMonths;
  }

  calculateMonthsStale(pushedAt: string): number {
    const pushedDate = new Date(pushedAt);
    const currentDate = new Date();

    const yearsDiff = currentDate.getUTCFullYear() - pushedDate.getUTCFullYear();
    const monthsDiff = currentDate.getUTCMonth() - pushedDate.getUTCMonth();
    const totalMonths = yearsDiff * 12 + monthsDiff;

    return Math.max(0, totalMonths);
  }

  async detectStaleness(items: GhostItem[]): Promise<StalenessResult> {
    const { createStaleDatabaseManager } = await import('./stale-database.js');

    const dbManager = createStaleDatabaseManager(this.config.databasePath);
    await dbManager.initialize();

    try {
      const existingStaleItems = await dbManager.getAllStaleItems();
      const existingStaleMap = new Map(existingStaleItems.map(item => [item.id, item]));

      const activeItems: GhostItem[] = [];
      const newlyStaleItems: StaleItem[] = [];
      const reactivatedItems: GhostItem[] = [];

      const currentDate = new Date();
      const currentTimestamp = currentDate.toISOString();

      for (const item of items) {
        const itemIsStale = this.isStale(item);
        const wasStale = existingStaleMap.has(item.id);

        if (itemIsStale) {
          if (wasStale) {
            const existingStaleItem = existingStaleMap.get(item.id)!;
            const updatedStaleItem: StaleItem = {
              ...item,
              staleDetectedAt: existingStaleItem.staleDetectedAt,
              monthsStale: this.calculateMonthsStale(item.pushedAt),
            };
            newlyStaleItems.push(updatedStaleItem);
          } else {
            const staleItem: StaleItem = {
              ...item,
              staleDetectedAt: currentTimestamp,
              monthsStale: this.calculateMonthsStale(item.pushedAt),
            };
            newlyStaleItems.push(staleItem);
          }
          existingStaleMap.delete(item.id);
        } else {
          if (wasStale) {
            console.log(`✓ Reactivated: ${item.name} (${item.id})`);
            reactivatedItems.push(item);
            existingStaleMap.delete(item.id);
          }
          activeItems.push(item);
        }
      }

      const totalProcessed = items.length;
      const activeCount = activeItems.length;

      const trulyNewlyStale = newlyStaleItems.filter(item => {
        return !existingStaleItems.some(existing => existing.id === item.id);
      }).length;

      const reactivated = reactivatedItems.length;

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
      dbManager.close();
    }
  }
}

export function createStalenessDetector(config: StalenessConfig): StalenessDetector {
  return new StalenessDetector(config);
}
