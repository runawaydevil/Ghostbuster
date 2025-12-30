/**
 * Ignore list filtering system for Le Ghost
 * Handles blacklist processing with pattern matching
 */

import { IgnoreRule, RepositoryData, GhostItem } from './types.js';

/**
 * Check if a repository should be ignored based on ignore rules
 */
export function shouldIgnoreRepository(repo: string, ignoreRules: IgnoreRule): boolean {
  // Check exact matches first (faster)
  if (ignoreRules.repos.includes(repo)) {
    return true;
  }

  // Check pattern matches
  for (const pattern of ignoreRules.patterns) {
    try {
      const regex = new RegExp(pattern, 'i'); // Case-insensitive matching
      if (regex.test(repo)) {
        return true;
      }
    } catch (error) {
      // Invalid regex pattern, log warning and skip
      console.warn(`Invalid regex pattern in ignore rules: ${pattern} - ${error}`);
      continue;
    }
  }

  return false;
}

/**
 * Filter repositories based on ignore rules
 */
export function filterIgnoredRepositories(
  repositories: RepositoryData[],
  ignoreRules: IgnoreRule
): { 
  allowed: RepositoryData[], 
  ignored: RepositoryData[],
  ignoredReasons: Map<string, string>
} {
  const allowed: RepositoryData[] = [];
  const ignored: RepositoryData[] = [];
  const ignoredReasons = new Map<string, string>();

  for (const repo of repositories) {
    const repoId = repo.full_name;
    
    // Check exact matches first
    if (ignoreRules.repos.includes(repoId)) {
      ignored.push(repo);
      ignoredReasons.set(repoId, `Exact match in ignore list`);
      continue;
    }

    // Check pattern matches
    let isIgnored = false;
    let matchedPattern = '';
    
    for (const pattern of ignoreRules.patterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(repoId)) {
          isIgnored = true;
          matchedPattern = pattern;
          break;
        }
      } catch (error) {
        // Invalid regex pattern, skip it
        console.warn(`Invalid regex pattern in ignore rules: ${pattern} - ${error}`);
        continue;
      }
    }

    if (isIgnored) {
      ignored.push(repo);
      ignoredReasons.set(repoId, `Matched pattern: ${matchedPattern}`);
    } else {
      allowed.push(repo);
    }
  }

  return { allowed, ignored, ignoredReasons };
}

/**
 * Filter GhostItems based on ignore rules
 */
export function filterIgnoredItems(
  items: GhostItem[],
  ignoreRules: IgnoreRule
): {
  allowed: GhostItem[],
  ignored: GhostItem[],
  ignoredReasons: Map<string, string>
} {
  const allowed: GhostItem[] = [];
  const ignored: GhostItem[] = [];
  const ignoredReasons = new Map<string, string>();

  for (const item of items) {
    const repoId = item.repo;
    
    // Check exact matches first
    if (ignoreRules.repos.includes(repoId)) {
      ignored.push(item);
      ignoredReasons.set(repoId, `Exact match in ignore list`);
      continue;
    }

    // Check pattern matches
    let isIgnored = false;
    let matchedPattern = '';
    
    for (const pattern of ignoreRules.patterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(repoId)) {
          isIgnored = true;
          matchedPattern = pattern;
          break;
        }
      } catch (error) {
        // Invalid regex pattern, skip it
        console.warn(`Invalid regex pattern in ignore rules: ${pattern} - ${error}`);
        continue;
      }
    }

    if (isIgnored) {
      ignored.push(item);
      ignoredReasons.set(repoId, `Matched pattern: ${matchedPattern}`);
    } else {
      allowed.push(item);
    }
  }

  return { allowed, ignored, ignoredReasons };
}

/**
 * Validate ignore patterns for regex correctness
 */
export function validateIgnorePatterns(patterns: string[]): {
  valid: string[],
  invalid: { pattern: string, error: string }[]
} {
  const valid: string[] = [];
  const invalid: { pattern: string, error: string }[] = [];

  for (const pattern of patterns) {
    try {
      new RegExp(pattern);
      valid.push(pattern);
    } catch (error) {
      invalid.push({
        pattern,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return { valid, invalid };
}

/**
 * Add repository to ignore list
 */
export function addToIgnoreList(
  ignoreRules: IgnoreRule,
  repo: string,
  usePattern: boolean = false
): IgnoreRule {
  const updatedRules = {
    repos: [...ignoreRules.repos],
    patterns: [...ignoreRules.patterns]
  };

  if (usePattern) {
    // Add as pattern if not already present
    if (!updatedRules.patterns.includes(repo)) {
      updatedRules.patterns.push(repo);
    }
  } else {
    // Add as exact match if not already present
    if (!updatedRules.repos.includes(repo)) {
      updatedRules.repos.push(repo);
    }
  }

  return updatedRules;
}

/**
 * Remove repository from ignore list
 */
export function removeFromIgnoreList(
  ignoreRules: IgnoreRule,
  repo: string
): IgnoreRule {
  return {
    repos: ignoreRules.repos.filter(r => r !== repo),
    patterns: ignoreRules.patterns.filter(p => p !== repo)
  };
}

/**
 * Check if a repository matches common ignore patterns
 */
export function matchesCommonIgnorePatterns(repo: string): {
  matches: boolean,
  reasons: string[]
} {
  const commonPatterns = [
    { pattern: /.*-test$/i, reason: 'Test repository (ends with -test)' },
    { pattern: /^test-.*/i, reason: 'Test repository (starts with test-)' },
    { pattern: /.*-backup$/i, reason: 'Backup repository' },
    { pattern: /.*-fork$/i, reason: 'Fork repository' },
    { pattern: /^demo-.*/i, reason: 'Demo repository' },
    { pattern: /.*-example$/i, reason: 'Example repository' },
    { pattern: /^tmp-.*/i, reason: 'Temporary repository' },
    { pattern: /.*-deprecated$/i, reason: 'Deprecated repository' },
    { pattern: /^archive-.*/i, reason: 'Archived repository' },
    { pattern: /.*-mirror$/i, reason: 'Mirror repository' },
    { pattern: /.*-clone$/i, reason: 'Clone repository' },
    { pattern: /.*-copy$/i, reason: 'Copy repository' }
  ];

  const reasons: string[] = [];
  let matches = false;

  for (const { pattern, reason } of commonPatterns) {
    if (pattern.test(repo)) {
      matches = true;
      reasons.push(reason);
    }
  }

  return { matches, reasons };
}