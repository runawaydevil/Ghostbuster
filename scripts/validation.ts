/**
 * YAML schema validation functions for Le Ghost system
 */

import * as yaml from 'js-yaml';
import { GhostItem, Override, IgnoreRule, SearchQuery } from './types.js';

/**
 * Validation error class
 */
export class ValidationError extends Error {
  constructor(message: string, public field?: string, public value?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate a GhostItem object
 */
export function validateGhostItem(item: any): GhostItem {
  if (!item || typeof item !== 'object') {
    throw new ValidationError('GhostItem must be an object');
  }

  // Required string fields
  const requiredStrings = ['id', 'name', 'repo', 'url', 'category'];
  for (const field of requiredStrings) {
    if (!item[field] || typeof item[field] !== 'string') {
      throw new ValidationError(`${field} is required and must be a string`, field, item[field]);
    }
  }

  // Validate arrays
  if (!Array.isArray(item.tags)) {
    throw new ValidationError('tags must be an array', 'tags', item.tags);
  }
  if (!Array.isArray(item.topics)) {
    throw new ValidationError('topics must be an array', 'topics', item.topics);
  }

  // Validate numbers
  if (typeof item.stars !== 'number' || item.stars < 0) {
    throw new ValidationError('stars must be a non-negative number', 'stars', item.stars);
  }
  if (typeof item.score !== 'number' || item.score < 0 || item.score > 100) {
    throw new ValidationError('score must be a number between 0 and 100', 'score', item.score);
  }

  // Validate booleans
  if (typeof item.archived !== 'boolean') {
    throw new ValidationError('archived must be a boolean', 'archived', item.archived);
  }
  if (typeof item.fork !== 'boolean') {
    throw new ValidationError('fork must be a boolean', 'fork', item.fork);
  }
  if (typeof item.hidden !== 'boolean') {
    throw new ValidationError('hidden must be a boolean', 'hidden', item.hidden);
  }

  // Validate confidence enum
  const validConfidence = ['high', 'medium', 'low'];
  if (!validConfidence.includes(item.confidence)) {
    throw new ValidationError('confidence must be one of: high, medium, low', 'confidence', item.confidence);
  }

  // Validate category enum
  const validCategories = ['Theme', 'Tool', 'Starter', 'Official'];
  if (!validCategories.includes(item.category)) {
    throw new ValidationError('category must be one of: Theme, Tool, Starter, Official', 'category', item.category);
  }

  // Validate ISO date string
  if (!item.pushedAt || isNaN(Date.parse(item.pushedAt))) {
    throw new ValidationError('pushedAt must be a valid ISO date string', 'pushedAt', item.pushedAt);
  }

  // Validate nullable fields
  if (item.description !== null && typeof item.description !== 'string') {
    throw new ValidationError('description must be a string or null', 'description', item.description);
  }
  if (item.license !== null && typeof item.license !== 'string') {
    throw new ValidationError('license must be a string or null', 'license', item.license);
  }
  if (item.notes !== null && typeof item.notes !== 'string') {
    throw new ValidationError('notes must be a string or null', 'notes', item.notes);
  }

  return item as GhostItem;
}

/**
 * Validate an Override object
 */
export function validateOverride(override: any): Override {
  if (!override || typeof override !== 'object') {
    throw new ValidationError('Override must be an object');
  }

  if (!override.repo || typeof override.repo !== 'string') {
    throw new ValidationError('repo is required and must be a string', 'repo', override.repo);
  }

  // Optional string fields
  const optionalStrings = ['name', 'category', 'notes'];
  for (const field of optionalStrings) {
    if (override[field] !== undefined && typeof override[field] !== 'string') {
      throw new ValidationError(`${field} must be a string if provided`, field, override[field]);
    }
  }

  // Optional array fields
  const optionalArrays = ['tags_add', 'tags_remove'];
  for (const field of optionalArrays) {
    if (override[field] !== undefined && !Array.isArray(override[field])) {
      throw new ValidationError(`${field} must be an array if provided`, field, override[field]);
    }
  }

  // Optional boolean field
  if (override.hidden !== undefined && typeof override.hidden !== 'boolean') {
    throw new ValidationError('hidden must be a boolean if provided', 'hidden', override.hidden);
  }

  return override as Override;
}

/**
 * Validate an IgnoreRule object
 */
export function validateIgnoreRule(rule: any): IgnoreRule {
  if (!rule || typeof rule !== 'object') {
    throw new ValidationError('IgnoreRule must be an object');
  }

  if (!Array.isArray(rule.repos)) {
    throw new ValidationError('repos must be an array', 'repos', rule.repos);
  }

  if (!Array.isArray(rule.patterns)) {
    throw new ValidationError('patterns must be an array', 'patterns', rule.patterns);
  }

  // Validate that all repos are strings
  for (let i = 0; i < rule.repos.length; i++) {
    if (typeof rule.repos[i] !== 'string') {
      throw new ValidationError(`repos[${i}] must be a string`, `repos[${i}]`, rule.repos[i]);
    }
  }

  // Validate that all patterns are strings and valid regex
  for (let i = 0; i < rule.patterns.length; i++) {
    if (typeof rule.patterns[i] !== 'string') {
      throw new ValidationError(`patterns[${i}] must be a string`, `patterns[${i}]`, rule.patterns[i]);
    }
    try {
      new RegExp(rule.patterns[i]);
    } catch (e) {
      throw new ValidationError(`patterns[${i}] must be a valid regex pattern`, `patterns[${i}]`, rule.patterns[i]);
    }
  }

  return rule as IgnoreRule;
}

/**
 * Validate a SearchQuery object
 */
export function validateSearchQuery(query: any): SearchQuery {
  if (!query || typeof query !== 'object') {
    throw new ValidationError('SearchQuery must be an object');
  }

  if (!query.query || typeof query.query !== 'string') {
    throw new ValidationError('query is required and must be a string', 'query', query.query);
  }

  if (typeof query.maxResults !== 'number' || query.maxResults <= 0) {
    throw new ValidationError('maxResults must be a positive number', 'maxResults', query.maxResults);
  }

  if (typeof query.minStars !== 'number' || query.minStars < 0) {
    throw new ValidationError('minStars must be a non-negative number', 'minStars', query.minStars);
  }

  return query as SearchQuery;
}

/**
 * Parse and validate YAML content
 */
export function parseAndValidateYaml<T>(
  content: string,
  validator: (item: any) => T,
  isArray: boolean = false
): T | T[] {
  try {
    const parsed = yaml.load(content);
    
    if (isArray) {
      if (!Array.isArray(parsed)) {
        throw new ValidationError('YAML content must be an array');
      }
      return parsed.map((item, index) => {
        try {
          return validator(item);
        } catch (error) {
          if (error instanceof ValidationError) {
            throw new ValidationError(`Item ${index}: ${error.message}`, error.field, error.value);
          }
          throw error;
        }
      });
    } else {
      return validator(parsed);
    }
  } catch (error) {
    if (error instanceof yaml.YAMLException) {
      throw new ValidationError(`YAML parsing error: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Validate items.yml content
 */
export function validateItemsYaml(content: string): GhostItem[] {
  return parseAndValidateYaml(content, validateGhostItem, true) as GhostItem[];
}

/**
 * Validate overrides.yml content
 */
export function validateOverridesYaml(content: string): Override[] {
  return parseAndValidateYaml(content, validateOverride, true) as Override[];
}

/**
 * Validate ignore.yml content
 */
export function validateIgnoreYaml(content: string): IgnoreRule {
  return parseAndValidateYaml(content, validateIgnoreRule, false) as IgnoreRule;
}

/**
 * Validate sources.yml content
 */
export function validateSourcesYaml(content: string): SearchQuery[] {
  return parseAndValidateYaml(content, validateSearchQuery, true) as SearchQuery[];
}