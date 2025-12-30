/**
 * Cache management utilities for Le Ghost system
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';

export interface CacheEntry {
  data: any;
  timestamp: number;
  etag?: string;
}

export interface CacheStats {
  totalFiles: number;
  totalSize: number;
  oldestEntry: number;
  newestEntry: number;
  expiredFiles: number;
}

/**
 * Cache manager for handling TTL, cleanup, and statistics
 */
export class CacheManager {
  private cacheDir: string;
  private ttl: number;

  constructor(cacheDir: string, ttl: number) {
    this.cacheDir = cacheDir;
    this.ttl = ttl;
  }

  /**
   * Get cache entry if valid
   */
  get(key: string): CacheEntry | null {
    const cacheFile = join(this.cacheDir, `${key}.json`);
    
    if (!existsSync(cacheFile)) {
      return null;
    }

    try {
      const content = readFileSync(cacheFile, 'utf-8');
      const entry: CacheEntry = JSON.parse(content);
      
      // Check if cache is still valid
      const age = Date.now() - entry.timestamp;
      if (age > this.ttl) {
        return null;
      }

      return entry;
    } catch (error) {
      // Invalid cache file, ignore
      return null;
    }
  }

  /**
   * Set cache entry
   */
  set(key: string, data: any, etag?: string): void {
    const cacheFile = join(this.cacheDir, `${key}.json`);
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      etag
    };

    try {
      writeFileSync(cacheFile, JSON.stringify(entry, null, 2));
    } catch (error) {
      console.warn(`Failed to write cache file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if cache entry exists and is valid
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Delete cache entry
   */
  delete(key: string): boolean {
    const cacheFile = join(this.cacheDir, `${key}.json`);
    
    if (!existsSync(cacheFile)) {
      return false;
    }

    try {
      unlinkSync(cacheFile);
      return true;
    } catch (error) {
      console.warn(`Failed to delete cache file: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Clean up expired cache entries
   */
  cleanup(): { deletedFiles: number; freedSpace: number } {
    if (!existsSync(this.cacheDir)) {
      return { deletedFiles: 0, freedSpace: 0 };
    }

    let deletedFiles = 0;
    let freedSpace = 0;

    try {
      const files = readdirSync(this.cacheDir);
      
      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = join(this.cacheDir, file);
        
        try {
          const stats = statSync(filePath);
          const content = readFileSync(filePath, 'utf-8');
          const entry: CacheEntry = JSON.parse(content);
          
          // Check if entry is expired
          const age = Date.now() - entry.timestamp;
          if (age > this.ttl) {
            unlinkSync(filePath);
            deletedFiles++;
            freedSpace += stats.size;
          }
        } catch (error) {
          // Invalid cache file, delete it
          try {
            const stats = statSync(filePath);
            unlinkSync(filePath);
            deletedFiles++;
            freedSpace += stats.size;
          } catch (deleteError) {
            // Ignore delete errors
          }
        }
      }
    } catch (error) {
      console.warn(`Cache cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { deletedFiles, freedSpace };
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const stats: CacheStats = {
      totalFiles: 0,
      totalSize: 0,
      oldestEntry: Date.now(),
      newestEntry: 0,
      expiredFiles: 0
    };

    if (!existsSync(this.cacheDir)) {
      return stats;
    }

    try {
      const files = readdirSync(this.cacheDir);
      
      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = join(this.cacheDir, file);
        
        try {
          const fileStats = statSync(filePath);
          const content = readFileSync(filePath, 'utf-8');
          const entry: CacheEntry = JSON.parse(content);
          
          stats.totalFiles++;
          stats.totalSize += fileStats.size;
          
          if (entry.timestamp < stats.oldestEntry) {
            stats.oldestEntry = entry.timestamp;
          }
          
          if (entry.timestamp > stats.newestEntry) {
            stats.newestEntry = entry.timestamp;
          }
          
          // Check if entry is expired
          const age = Date.now() - entry.timestamp;
          if (age > this.ttl) {
            stats.expiredFiles++;
          }
        } catch (error) {
          // Invalid cache file
          stats.expiredFiles++;
        }
      }
    } catch (error) {
      console.warn(`Failed to get cache stats: ${error instanceof Error ? error.message : String(error)}`);
    }

    return stats;
  }

  /**
   * Clear all cache entries
   */
  clear(): { deletedFiles: number; freedSpace: number } {
    if (!existsSync(this.cacheDir)) {
      return { deletedFiles: 0, freedSpace: 0 };
    }

    let deletedFiles = 0;
    let freedSpace = 0;

    try {
      const files = readdirSync(this.cacheDir);
      
      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = join(this.cacheDir, file);
        
        try {
          const stats = statSync(filePath);
          unlinkSync(filePath);
          deletedFiles++;
          freedSpace += stats.size;
        } catch (error) {
          // Ignore delete errors
        }
      }
    } catch (error) {
      console.warn(`Cache clear failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { deletedFiles, freedSpace };
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Print cache statistics in human readable format
   */
  printStats(): void {
    const stats = this.getStats();
    
    console.log('Cache Statistics:');
    console.log(`  Total files: ${stats.totalFiles}`);
    console.log(`  Total size: ${this.formatBytes(stats.totalSize)}`);
    console.log(`  Expired files: ${stats.expiredFiles}`);
    
    if (stats.totalFiles > 0) {
      const oldestAge = Date.now() - stats.oldestEntry;
      const newestAge = Date.now() - stats.newestEntry;
      
      console.log(`  Oldest entry: ${Math.round(oldestAge / 1000 / 60)} minutes ago`);
      console.log(`  Newest entry: ${Math.round(newestAge / 1000 / 60)} minutes ago`);
    }
  }
}

/**
 * Create a cache manager instance
 */
export function createCacheManager(cacheDir: string, ttl: number): CacheManager {
  return new CacheManager(cacheDir, ttl);
}