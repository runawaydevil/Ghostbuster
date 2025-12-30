/**
 * Data merging and override system for Le Ghost
 * Combines existing items with new discoveries, applies overrides and ignores
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { GhostItem, Override, IgnoreRule, MergeResult, ChangeRecord, RepositoryData, ClassificationResult } from './types.js';
import { validateItemsYaml, validateOverridesYaml, validateIgnoreYaml } from './validation.js';
import { shouldIgnoreRepository } from './ignore.js';

/**
 * Load existing items from items.yml
 */
export async function loadExistingItems(dataDir: string = 'data'): Promise<GhostItem[]> {
  try {
    const itemsPath = path.join(dataDir, 'items.yml');
    const content = await fs.readFile(itemsPath, 'utf-8');
    return validateItemsYaml(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist, return empty array
      return [];
    }
    throw error;
  }
}

/**
 * Load override rules from overrides.yml
 */
export async function loadOverrides(dataDir: string = 'data'): Promise<Override[]> {
  try {
    const overridesPath = path.join(dataDir, 'overrides.yml');
    const content = await fs.readFile(overridesPath, 'utf-8');
    return validateOverridesYaml(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist, return empty array
      return [];
    }
    throw error;
  }
}

/**
 * Load ignore rules from ignore.yml
 */
export async function loadIgnoreRules(dataDir: string = 'data'): Promise<IgnoreRule> {
  try {
    const ignorePath = path.join(dataDir, 'ignore.yml');
    const content = await fs.readFile(ignorePath, 'utf-8');
    return validateIgnoreYaml(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist, return empty rules
      return { repos: [], patterns: [] };
    }
    throw error;
  }
}

/**
 * Apply override rules to a GhostItem
 */
export function applyOverride(item: GhostItem, override: Override): GhostItem {
  const updatedItem = { ...item };

  // Apply name override
  if (override.name !== undefined) {
    updatedItem.name = override.name;
  }

  // Apply category override
  if (override.category !== undefined) {
    updatedItem.category = override.category;
  }

  // Apply tag additions
  if (override.tags_add && override.tags_add.length > 0) {
    const existingTags = new Set(updatedItem.tags);
    for (const tag of override.tags_add) {
      existingTags.add(tag);
    }
    updatedItem.tags = Array.from(existingTags);
  }

  // Apply tag removals
  if (override.tags_remove && override.tags_remove.length > 0) {
    const tagsToRemove = new Set(override.tags_remove);
    updatedItem.tags = updatedItem.tags.filter(tag => !tagsToRemove.has(tag));
  }

  // Apply notes override
  if (override.notes !== undefined) {
    updatedItem.notes = override.notes;
  }

  // Apply hidden override
  if (override.hidden !== undefined) {
    updatedItem.hidden = override.hidden;
  }

  return updatedItem;
}

/**
 * Convert RepositoryData to GhostItem with classification result
 */
export function repositoryToGhostItem(
  repo: RepositoryData,
  classification: ClassificationResult
): GhostItem {
  return {
    id: repo.full_name,
    name: repo.name,
    repo: repo.full_name,
    url: repo.html_url,
    description: repo.description,
    category: "Theme", // Default category, can be overridden
    tags: repo.topics || [],
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
 * Merge new discoveries with existing items
 */
export async function mergeData(
  newRepositories: RepositoryData[],
  classifications: Map<string, ClassificationResult>,
  dataDir: string = 'data'
): Promise<MergeResult> {
  // Load existing data
  const existingItems = await loadExistingItems(dataDir);
  const overrides = await loadOverrides(dataDir);
  const ignoreRules = await loadIgnoreRules(dataDir);

  // Create maps for efficient lookups
  const existingItemsMap = new Map<string, GhostItem>();
  for (const item of existingItems) {
    existingItemsMap.set(item.repo, item);
  }

  const overridesMap = new Map<string, Override>();
  for (const override of overrides) {
    overridesMap.set(override.repo, override);
  }

  // Track changes and statistics
  const changes: ChangeRecord[] = [];
  const stats = {
    added: 0,
    updated: 0,
    removed: 0,
    ignored: 0
  };

  // Process new repositories
  const processedRepos = new Set<string>();
  const finalItems: GhostItem[] = [];

  for (const repo of newRepositories) {
    const repoId = repo.full_name;
    processedRepos.add(repoId);

    // Check if repository should be ignored
    if (shouldIgnoreRepository(repoId, ignoreRules)) {
      stats.ignored++;
      changes.push({
        type: "ignored",
        repo: repoId,
        details: "Repository matches ignore rules"
      });
      continue;
    }

    // Get classification result
    const classification = classifications.get(repoId);
    if (!classification) {
      // Skip repositories without classification
      continue;
    }

    // Convert to GhostItem
    let newItem = repositoryToGhostItem(repo, classification);

    // Apply overrides if they exist
    const override = overridesMap.get(repoId);
    if (override) {
      newItem = applyOverride(newItem, override);
    }

    // Check if item should be hidden after overrides
    if (newItem.hidden) {
      stats.ignored++;
      changes.push({
        type: "ignored",
        repo: repoId,
        details: "Repository hidden by override rules"
      });
      continue;
    }

    // Check if this is an update or addition
    const existingItem = existingItemsMap.get(repoId);
    if (existingItem) {
      // Update existing item
      stats.updated++;
      changes.push({
        type: "updated",
        repo: repoId,
        details: `Updated: stars ${existingItem.stars} → ${newItem.stars}, score ${existingItem.score} → ${newItem.score}`
      });
    } else {
      // Add new item
      stats.added++;
      changes.push({
        type: "added",
        repo: repoId,
        details: `Added: ${newItem.category} with ${newItem.stars} stars, score ${newItem.score}`
      });
    }

    finalItems.push(newItem);
  }

  // Add existing items that weren't processed (not found in new repositories)
  for (const existingItem of existingItems) {
    if (!processedRepos.has(existingItem.repo)) {
      // Check if item should still be ignored
      if (shouldIgnoreRepository(existingItem.repo, ignoreRules)) {
        stats.ignored++;
        changes.push({
          type: "ignored",
          repo: existingItem.repo,
          details: "Existing repository now matches ignore rules"
        });
        continue;
      }

      // Apply current overrides to existing items
      let updatedItem = existingItem;
      const override = overridesMap.get(existingItem.repo);
      if (override) {
        updatedItem = applyOverride(existingItem, override);
      }

      // Check if item should be hidden after overrides
      if (updatedItem.hidden) {
        stats.ignored++;
        changes.push({
          type: "ignored",
          repo: existingItem.repo,
          details: "Existing repository hidden by override rules"
        });
        continue;
      }

      finalItems.push(updatedItem);
    }
  }

  // Sort items by stars (descending) for consistent output
  finalItems.sort((a, b) => b.stars - a.stars);

  return {
    items: finalItems,
    stats,
    changes
  };
}

/**
 * Save merged items back to items.yml
 */
export async function saveMergedItems(
  items: GhostItem[],
  dataDir: string = 'data'
): Promise<void> {
  const itemsPath = path.join(dataDir, 'items.yml');
  
  // Convert items to YAML format
  const yamlContent = `# Le Ghost - Canonical Items List
# This file contains the master list of all Ghost CMS resources
# Format: Array of GhostItem objects

${items.map(item => `- id: "${item.id}"
  name: "${item.name}"
  repo: "${item.repo}"
  url: "${item.url}"
  description: ${item.description ? `"${item.description.replace(/"/g, '\\"')}"` : 'null'}
  category: "${item.category}"
  tags: [${item.tags.map(tag => `"${tag}"`).join(', ')}]
  stars: ${item.stars}
  pushedAt: "${item.pushedAt}"
  archived: ${item.archived}
  fork: ${item.fork}
  license: ${item.license ? `"${item.license}"` : 'null'}
  topics: [${item.topics.map(topic => `"${topic}"`).join(', ')}]
  score: ${item.score}
  confidence: "${item.confidence}"
  notes: ${item.notes ? `"${item.notes.replace(/"/g, '\\"')}"` : 'null'}
  hidden: ${item.hidden}`).join('\n\n')}
`;

  await fs.writeFile(itemsPath, yamlContent, 'utf-8');
}
/**
 * Data merger class for easier usage
 */
export class DataMerger {
  /**
   * Merge data with existing items, overrides, and ignore rules
   */
  mergeData(
    existingItems: GhostItem[],
    newItems: GhostItem[],
    overrides: Override[],
    ignoreRules: IgnoreRule
  ): MergeResult {
    // Create maps for efficient lookups
    const existingItemsMap = new Map<string, GhostItem>();
    for (const item of existingItems) {
      existingItemsMap.set(item.repo, item);
    }

    const overridesMap = new Map<string, Override>();
    for (const override of overrides) {
      overridesMap.set(override.repo, override);
    }

    // Track changes and statistics
    const changes: ChangeRecord[] = [];
    const stats = {
      added: 0,
      updated: 0,
      removed: 0,
      ignored: 0
    };

    // Process new items
    const processedRepos = new Set<string>();
    const finalItems: GhostItem[] = [];

    for (const newItem of newItems) {
      const repoId = newItem.repo;
      processedRepos.add(repoId);

      // Check if repository should be ignored
      if (shouldIgnoreRepository(repoId, ignoreRules)) {
        stats.ignored++;
        changes.push({
          type: "ignored",
          repo: repoId,
          details: "Repository matches ignore rules"
        });
        continue;
      }

      // Apply overrides if they exist
      let processedItem = newItem;
      const override = overridesMap.get(repoId);
      if (override) {
        processedItem = applyOverride(newItem, override);
      }

      // Check if item should be hidden after overrides
      if (processedItem.hidden) {
        stats.ignored++;
        changes.push({
          type: "ignored",
          repo: repoId,
          details: "Repository hidden by override rules"
        });
        continue;
      }

      // Check if this is an update or addition
      const existingItem = existingItemsMap.get(repoId);
      if (existingItem) {
        // Update existing item
        stats.updated++;
        changes.push({
          type: "updated",
          repo: repoId,
          details: `Updated: stars ${existingItem.stars} → ${processedItem.stars}, score ${existingItem.score} → ${processedItem.score}`
        });
      } else {
        // Add new item
        stats.added++;
        changes.push({
          type: "added",
          repo: repoId,
          details: `Added: ${processedItem.category} with ${processedItem.stars} stars, score ${processedItem.score}`
        });
      }

      finalItems.push(processedItem);
    }

    // Add existing items that weren't processed (not found in new items)
    for (const existingItem of existingItems) {
      if (!processedRepos.has(existingItem.repo)) {
        // Check if item should still be ignored
        if (shouldIgnoreRepository(existingItem.repo, ignoreRules)) {
          stats.removed++;
          changes.push({
            type: "removed",
            repo: existingItem.repo,
            details: "Existing repository now matches ignore rules"
          });
          continue;
        }

        // Apply current overrides to existing items
        let updatedItem = existingItem;
        const override = overridesMap.get(existingItem.repo);
        if (override) {
          updatedItem = applyOverride(existingItem, override);
        }

        // Check if item should be hidden after overrides
        if (updatedItem.hidden) {
          stats.removed++;
          changes.push({
            type: "removed",
            repo: existingItem.repo,
            details: "Existing repository hidden by override rules"
          });
          continue;
        }

        finalItems.push(updatedItem);
      }
    }

    // Sort items by stars (descending) for consistent output
    finalItems.sort((a, b) => b.stars - a.stars);

    return {
      items: finalItems,
      stats,
      changes
    };
  }
}

/**
 * Create a data merger instance
 */
export function createMerger(): DataMerger {
  return new DataMerger();
}