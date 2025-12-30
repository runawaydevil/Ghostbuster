/**
 * Data integrity and duplicate detection utilities
 */

import { GhostItem, RepositoryData } from './types.js';

export interface DuplicateReport {
  duplicates: {
    primary: GhostItem;
    duplicates: GhostItem[];
    reason: string;
  }[];
  totalDuplicates: number;
  uniqueItems: GhostItem[];
}

export interface ConsistencyReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalItems: number;
    validUrls: number;
    invalidUrls: number;
    missingDescriptions: number;
    missingCategories: number;
  };
}

/**
 * Data integrity checker for Ghost items
 */
export class DataIntegrityChecker {
  
  /**
   * Detect duplicate repositories in the dataset
   */
  detectDuplicates(items: GhostItem[]): DuplicateReport {
    const duplicateGroups: Map<string, GhostItem[]> = new Map();
    const seenRepos = new Set<string>();
    const seenUrls = new Set<string>();
    const uniqueItems: GhostItem[] = [];

    // Group items by repository identifier
    for (const item of items) {
      const repoKey = item.repo.toLowerCase();
      const urlKey = item.url.toLowerCase();

      if (!duplicateGroups.has(repoKey)) {
        duplicateGroups.set(repoKey, []);
      }
      duplicateGroups.get(repoKey)!.push(item);
    }

    const duplicates: DuplicateReport['duplicates'] = [];
    let totalDuplicates = 0;

    // Process each group to find duplicates
    for (const [repoKey, groupItems] of duplicateGroups) {
      if (groupItems.length > 1) {
        // Sort by stars (descending) to pick the best as primary
        const sortedItems = groupItems.sort((a, b) => b.stars - a.stars);
        const primary = sortedItems[0];
        const duplicateItems = sortedItems.slice(1);

        duplicates.push({
          primary,
          duplicates: duplicateItems,
          reason: `Multiple entries for repository: ${repoKey}`
        });

        totalDuplicates += duplicateItems.length;
        uniqueItems.push(primary);
      } else {
        uniqueItems.push(groupItems[0]);
      }
    }

    // Also check for URL duplicates (different repo names, same URL)
    const urlGroups: Map<string, GhostItem[]> = new Map();
    for (const item of uniqueItems) {
      const urlKey = item.url.toLowerCase();
      if (!urlGroups.has(urlKey)) {
        urlGroups.set(urlKey, []);
      }
      urlGroups.get(urlKey)!.push(item);
    }

    // Find URL duplicates
    for (const [urlKey, groupItems] of urlGroups) {
      if (groupItems.length > 1) {
        const sortedItems = groupItems.sort((a, b) => b.stars - a.stars);
        const primary = sortedItems[0];
        const duplicateItems = sortedItems.slice(1);

        duplicates.push({
          primary,
          duplicates: duplicateItems,
          reason: `Multiple entries with same URL: ${urlKey}`
        });

        totalDuplicates += duplicateItems.length;
      }
    }

    return {
      duplicates,
      totalDuplicates,
      uniqueItems: this.removeDuplicatesByUrl(uniqueItems)
    };
  }

  /**
   * Remove duplicates by URL from a list of items
   */
  private removeDuplicatesByUrl(items: GhostItem[]): GhostItem[] {
    const seenUrls = new Set<string>();
    const uniqueItems: GhostItem[] = [];

    // Sort by stars descending to prefer higher-starred items
    const sortedItems = items.sort((a, b) => b.stars - a.stars);

    for (const item of sortedItems) {
      const urlKey = item.url.toLowerCase();
      if (!seenUrls.has(urlKey)) {
        seenUrls.add(urlKey);
        uniqueItems.push(item);
      }
    }

    return uniqueItems;
  }

  /**
   * Validate data consistency and integrity
   */
  validateConsistency(items: GhostItem[]): ConsistencyReport {
    const errors: string[] = [];
    const warnings: string[] = [];
    const stats = {
      totalItems: items.length,
      validUrls: 0,
      invalidUrls: 0,
      missingDescriptions: 0,
      missingCategories: 0
    };

    for (const item of items) {
      // Validate required fields
      if (!item.id || item.id.trim() === '') {
        errors.push(`Item missing ID: ${JSON.stringify(item)}`);
      }

      if (!item.name || item.name.trim() === '') {
        errors.push(`Item ${item.id} missing name`);
      }

      if (!item.repo || item.repo.trim() === '') {
        errors.push(`Item ${item.id} missing repo`);
      }

      if (!item.url || item.url.trim() === '') {
        errors.push(`Item ${item.id} missing URL`);
      } else {
        // Validate URL format
        try {
          new URL(item.url);
          stats.validUrls++;
        } catch (error) {
          errors.push(`Item ${item.id} has invalid URL: ${item.url}`);
          stats.invalidUrls++;
        }
      }

      // Check for missing optional but important fields
      if (!item.description || item.description.trim() === '') {
        stats.missingDescriptions++;
        warnings.push(`Item ${item.id} missing description`);
      }

      if (!item.category || item.category.trim() === '') {
        stats.missingCategories++;
        errors.push(`Item ${item.id} missing category`);
      }

      // Validate category values
      const validCategories = ['Official', 'Theme', 'Tool', 'Starter'];
      if (item.category && !validCategories.includes(item.category)) {
        warnings.push(`Item ${item.id} has non-standard category: ${item.category}`);
      }

      // Validate numeric fields
      if (typeof item.stars !== 'number' || item.stars < 0) {
        errors.push(`Item ${item.id} has invalid stars count: ${item.stars}`);
      }

      if (typeof item.score !== 'number' || item.score < 0 || item.score > 100) {
        errors.push(`Item ${item.id} has invalid score: ${item.score}`);
      }

      // Validate confidence levels
      const validConfidence = ['high', 'medium', 'low'];
      if (!validConfidence.includes(item.confidence)) {
        errors.push(`Item ${item.id} has invalid confidence: ${item.confidence}`);
      }

      // Validate date format
      if (item.pushedAt) {
        try {
          new Date(item.pushedAt);
        } catch (error) {
          errors.push(`Item ${item.id} has invalid pushedAt date: ${item.pushedAt}`);
        }
      }

      // Validate arrays
      if (!Array.isArray(item.tags)) {
        errors.push(`Item ${item.id} tags must be an array`);
      }

      if (!Array.isArray(item.topics)) {
        errors.push(`Item ${item.id} topics must be an array`);
      }

      // Validate boolean fields
      if (typeof item.archived !== 'boolean') {
        errors.push(`Item ${item.id} archived must be boolean`);
      }

      if (typeof item.fork !== 'boolean') {
        errors.push(`Item ${item.id} fork must be boolean`);
      }

      if (typeof item.hidden !== 'boolean') {
        errors.push(`Item ${item.id} hidden must be boolean`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats
    };
  }

  /**
   * Merge duplicate items, keeping the best data from each
   */
  mergeDuplicates(primary: GhostItem, duplicates: GhostItem[]): GhostItem {
    const merged = { ...primary };

    for (const duplicate of duplicates) {
      // Keep the highest star count
      if (duplicate.stars > merged.stars) {
        merged.stars = duplicate.stars;
      }

      // Keep the most recent push date
      if (duplicate.pushedAt && (!merged.pushedAt || duplicate.pushedAt > merged.pushedAt)) {
        merged.pushedAt = duplicate.pushedAt;
      }

      // Merge tags (unique)
      const allTags = [...merged.tags, ...duplicate.tags];
      merged.tags = [...new Set(allTags)];

      // Merge topics (unique)
      const allTopics = [...merged.topics, ...duplicate.topics];
      merged.topics = [...new Set(allTopics)];

      // Keep the best description (longest non-null)
      if (duplicate.description && 
          (!merged.description || duplicate.description.length > merged.description.length)) {
        merged.description = duplicate.description;
      }

      // Keep the highest score
      if (duplicate.score > merged.score) {
        merged.score = duplicate.score;
        merged.confidence = duplicate.confidence;
      }

      // Keep license if missing
      if (!merged.license && duplicate.license) {
        merged.license = duplicate.license;
      }

      // Merge notes
      if (duplicate.notes) {
        if (merged.notes) {
          merged.notes = `${merged.notes}; ${duplicate.notes}`;
        } else {
          merged.notes = duplicate.notes;
        }
      }
    }

    return merged;
  }

  /**
   * Clean and deduplicate a dataset
   */
  cleanDataset(items: GhostItem[]): {
    cleanedItems: GhostItem[];
    duplicateReport: DuplicateReport;
    consistencyReport: ConsistencyReport;
  } {
    // First, detect duplicates
    const duplicateReport = this.detectDuplicates(items);
    
    // Merge duplicates to create clean dataset
    const cleanedItems: GhostItem[] = [];
    
    // Add unique items
    for (const item of duplicateReport.uniqueItems) {
      cleanedItems.push(item);
    }

    // Add merged duplicates
    for (const duplicateGroup of duplicateReport.duplicates) {
      const merged = this.mergeDuplicates(duplicateGroup.primary, duplicateGroup.duplicates);
      // Replace the primary with the merged version
      const primaryIndex = cleanedItems.findIndex(item => item.id === duplicateGroup.primary.id);
      if (primaryIndex >= 0) {
        cleanedItems[primaryIndex] = merged;
      } else {
        cleanedItems.push(merged);
      }
    }

    // Validate consistency of cleaned dataset
    const consistencyReport = this.validateConsistency(cleanedItems);

    return {
      cleanedItems,
      duplicateReport,
      consistencyReport
    };
  }

  /**
   * Compare two datasets and find differences
   */
  compareDatasets(oldItems: GhostItem[], newItems: GhostItem[]): {
    added: GhostItem[];
    removed: GhostItem[];
    updated: { old: GhostItem; new: GhostItem }[];
    unchanged: GhostItem[];
  } {
    const oldMap = new Map<string, GhostItem>();
    const newMap = new Map<string, GhostItem>();

    // Index items by ID
    for (const item of oldItems) {
      oldMap.set(item.id, item);
    }

    for (const item of newItems) {
      newMap.set(item.id, item);
    }

    const added: GhostItem[] = [];
    const removed: GhostItem[] = [];
    const updated: { old: GhostItem; new: GhostItem }[] = [];
    const unchanged: GhostItem[] = [];

    // Find added and updated items
    for (const [id, newItem] of newMap) {
      const oldItem = oldMap.get(id);
      
      if (!oldItem) {
        added.push(newItem);
      } else {
        // Check if item has changed (excluding timestamp-like fields)
        const hasChanged = this.hasItemChanged(oldItem, newItem);
        
        if (hasChanged) {
          updated.push({ old: oldItem, new: newItem });
        } else {
          unchanged.push(newItem);
        }
      }
    }

    // Find removed items
    for (const [id, oldItem] of oldMap) {
      if (!newMap.has(id)) {
        removed.push(oldItem);
      }
    }

    return { added, removed, updated, unchanged };
  }

  /**
   * Check if an item has changed (excluding timestamp fields)
   */
  private hasItemChanged(oldItem: GhostItem, newItem: GhostItem): boolean {
    // Fields to compare (excluding pushedAt which changes frequently)
    const fieldsToCompare = [
      'name', 'description', 'category', 'stars', 'archived', 'fork',
      'license', 'score', 'confidence', 'notes', 'hidden'
    ];

    for (const field of fieldsToCompare) {
      if (JSON.stringify(oldItem[field as keyof GhostItem]) !== 
          JSON.stringify(newItem[field as keyof GhostItem])) {
        return true;
      }
    }

    // Compare arrays
    if (JSON.stringify(oldItem.tags.sort()) !== JSON.stringify(newItem.tags.sort())) {
      return true;
    }

    if (JSON.stringify(oldItem.topics.sort()) !== JSON.stringify(newItem.topics.sort())) {
      return true;
    }

    return false;
  }

  /**
   * Print duplicate report in human readable format
   */
  printDuplicateReport(report: DuplicateReport): void {
    console.log('\nDuplicate Detection Report:');
    console.log(`  Total duplicates found: ${report.totalDuplicates}`);
    console.log(`  Unique items after deduplication: ${report.uniqueItems.length}`);

    if (report.duplicates.length > 0) {
      console.log('\nDuplicate Groups:');
      for (let i = 0; i < report.duplicates.length; i++) {
        const group = report.duplicates[i];
        console.log(`  ${i + 1}. ${group.reason}`);
        console.log(`     Primary: ${group.primary.name} (${group.primary.stars} stars)`);
        for (const dup of group.duplicates) {
          console.log(`     Duplicate: ${dup.name} (${dup.stars} stars)`);
        }
      }
    }
  }

  /**
   * Print consistency report in human readable format
   */
  printConsistencyReport(report: ConsistencyReport): void {
    console.log('\nData Consistency Report:');
    console.log(`  Status: ${report.valid ? 'VALID' : 'INVALID'}`);
    console.log(`  Total items: ${report.stats.totalItems}`);
    console.log(`  Valid URLs: ${report.stats.validUrls}`);
    console.log(`  Invalid URLs: ${report.stats.invalidUrls}`);
    console.log(`  Missing descriptions: ${report.stats.missingDescriptions}`);
    console.log(`  Missing categories: ${report.stats.missingCategories}`);

    if (report.errors.length > 0) {
      console.log('\nErrors:');
      for (const error of report.errors) {
        console.log(`  - ${error}`);
      }
    }

    if (report.warnings.length > 0) {
      console.log('\nWarnings:');
      for (const warning of report.warnings) {
        console.log(`  - ${warning}`);
      }
    }
  }
}

/**
 * Create a data integrity checker instance
 */
export function createDataIntegrityChecker(): DataIntegrityChecker {
  return new DataIntegrityChecker();
}