/**
 * Configuration management for Le Ghost system
 */

import { config } from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';

// Load environment variables from .env file
config();
import { 
  validateItemsYaml, 
  validateOverridesYaml, 
  validateIgnoreYaml, 
  validateSourcesYaml,
  ValidationError 
} from './validation.js';
import { GhostItem, Override, IgnoreRule, SearchQuery, CrawlerConfig } from './types.js';

/**
 * System configuration interface
 */
export interface SystemConfig {
  crawler: CrawlerConfig;
  classification: {
    thresholds: {
      high: number;
      medium: number;
      low: number;
    };
    weights: {
      topics: number;
      readme: number;
      structure: number;
      penalties: number;
    };
  };
  rendering: {
    template: string;
    output: string;
    categories: readonly string[];
  };
  github: {
    token: string;
  };
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  crawler: {
    queries: [] as SearchQuery[],
    rateLimit: {
      requestsPerHour: 5000,
      backoffMultiplier: 2
    },
    cache: {
      ttl: 3600000, // 1 hour in milliseconds
      directory: 'cache'
    }
  },
  classification: {
    thresholds: {
      high: 80,
      medium: 60,
      low: 40
    },
    weights: {
      topics: 0.4,
      readme: 0.3,
      structure: 0.2,
      penalties: 0.1
    }
  },
  rendering: {
    template: 'templates/index.template.html',
    output: 'index.html',
    categories: ['Official', 'Theme', 'Tool', 'Starter']
  }
} as const;

/**
 * Configuration validation functions
 */
export class ConfigValidator {
  
  /**
   * Validate crawler configuration
   */
  static validateCrawlerConfig(config: any): CrawlerConfig {
    if (!config || typeof config !== 'object') {
      throw new ValidationError('Crawler config must be an object');
    }

    // Validate queries
    if (!Array.isArray(config.queries)) {
      throw new ValidationError('queries must be an array');
    }

    // Validate rate limit settings
    if (!config.rateLimit || typeof config.rateLimit !== 'object') {
      throw new ValidationError('rateLimit must be an object');
    }

    if (typeof config.rateLimit.requestsPerHour !== 'number' || config.rateLimit.requestsPerHour <= 0) {
      throw new ValidationError('rateLimit.requestsPerHour must be a positive number');
    }

    if (typeof config.rateLimit.backoffMultiplier !== 'number' || config.rateLimit.backoffMultiplier < 1) {
      throw new ValidationError('rateLimit.backoffMultiplier must be >= 1');
    }

    // Validate cache settings
    if (!config.cache || typeof config.cache !== 'object') {
      throw new ValidationError('cache must be an object');
    }

    if (typeof config.cache.ttl !== 'number' || config.cache.ttl <= 0) {
      throw new ValidationError('cache.ttl must be a positive number');
    }

    if (typeof config.cache.directory !== 'string') {
      throw new ValidationError('cache.directory must be a string');
    }

    return config as CrawlerConfig;
  }

  /**
   * Validate classification configuration
   */
  static validateClassificationConfig(config: any): SystemConfig['classification'] {
    if (!config || typeof config !== 'object') {
      throw new ValidationError('Classification config must be an object');
    }

    // Validate thresholds
    if (!config.thresholds || typeof config.thresholds !== 'object') {
      throw new ValidationError('thresholds must be an object');
    }

    const thresholdFields = ['high', 'medium', 'low'];
    for (const field of thresholdFields) {
      if (typeof config.thresholds[field] !== 'number' || 
          config.thresholds[field] < 0 || 
          config.thresholds[field] > 100) {
        throw new ValidationError(`thresholds.${field} must be a number between 0 and 100`);
      }
    }

    // Validate threshold order
    if (config.thresholds.high <= config.thresholds.medium || 
        config.thresholds.medium <= config.thresholds.low) {
      throw new ValidationError('thresholds must be in descending order: high > medium > low');
    }

    // Validate weights
    if (!config.weights || typeof config.weights !== 'object') {
      throw new ValidationError('weights must be an object');
    }

    const weightFields = ['topics', 'readme', 'structure', 'penalties'];
    let totalWeight = 0;
    for (const field of weightFields) {
      if (typeof config.weights[field] !== 'number' || 
          config.weights[field] < 0 || 
          config.weights[field] > 1) {
        throw new ValidationError(`weights.${field} must be a number between 0 and 1`);
      }
      totalWeight += config.weights[field];
    }

    // Allow some tolerance for floating point precision
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      throw new ValidationError(`weights must sum to 1.0, got ${totalWeight}`);
    }

    return config as SystemConfig['classification'];
  }

  /**
   * Validate rendering configuration
   */
  static validateRenderingConfig(config: any): SystemConfig['rendering'] {
    if (!config || typeof config !== 'object') {
      throw new ValidationError('Rendering config must be an object');
    }

    if (typeof config.template !== 'string') {
      throw new ValidationError('template must be a string');
    }

    if (typeof config.output !== 'string') {
      throw new ValidationError('output must be a string');
    }

    if (!Array.isArray(config.categories)) {
      throw new ValidationError('categories must be an array');
    }

    for (let i = 0; i < config.categories.length; i++) {
      if (typeof config.categories[i] !== 'string') {
        throw new ValidationError(`categories[${i}] must be a string`);
      }
    }

    return config as SystemConfig['rendering'];
  }

  /**
   * Validate complete system configuration
   */
  static validateSystemConfig(config: any): SystemConfig {
    if (!config || typeof config !== 'object') {
      throw new ValidationError('System config must be an object');
    }

    return {
      crawler: this.validateCrawlerConfig(config.crawler),
      classification: this.validateClassificationConfig(config.classification),
      rendering: this.validateRenderingConfig(config.rendering),
      github: {
        token: config.github?.token || process.env.GITHUB_TOKEN || ''
      }
    };
  }
}

/**
 * Configuration file manager
 */
export class ConfigManager {
  private configPath: string;

  constructor(configPath: string = 'config.yml') {
    this.configPath = configPath;
  }

  /**
   * Load configuration from file with defaults
   */
  loadConfig(): SystemConfig {
    let userConfig: any = {};

    // Load user configuration if it exists
    if (existsSync(this.configPath)) {
      try {
        const content = readFileSync(this.configPath, 'utf-8');
        userConfig = yaml.load(content) || {};
      } catch (error) {
        throw new ValidationError(`Failed to load config file: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Merge with defaults
    const mergedConfig = this.mergeWithDefaults(userConfig);

    // Validate merged configuration
    return ConfigValidator.validateSystemConfig(mergedConfig);
  }

  /**
   * Save configuration to file
   */
  saveConfig(config: SystemConfig): void {
    try {
      const yamlContent = yaml.dump(config, {
        indent: 2,
        lineWidth: 120,
        noRefs: true
      });
      writeFileSync(this.configPath, yamlContent, 'utf-8');
    } catch (error) {
      throw new ValidationError(`Failed to save config file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create default configuration file
   */
  createDefaultConfig(): SystemConfig {
    const defaultConfig: SystemConfig = {
      crawler: DEFAULT_CONFIG.crawler,
      classification: DEFAULT_CONFIG.classification,
      rendering: DEFAULT_CONFIG.rendering,
      github: {
        token: process.env.GITHUB_TOKEN || ''
      }
    };

    this.saveConfig(defaultConfig);
    return defaultConfig;
  }

  /**
   * Merge user configuration with defaults
   */
  private mergeWithDefaults(userConfig: any): any {
    const merged = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); // Deep clone

    // Merge crawler config
    if (userConfig.crawler) {
      Object.assign(merged.crawler, userConfig.crawler);
      if (userConfig.crawler.rateLimit) {
        Object.assign(merged.crawler.rateLimit, userConfig.crawler.rateLimit);
      }
      if (userConfig.crawler.cache) {
        Object.assign(merged.crawler.cache, userConfig.crawler.cache);
      }
    }

    // Merge classification config
    if (userConfig.classification) {
      Object.assign(merged.classification, userConfig.classification);
      if (userConfig.classification.thresholds) {
        Object.assign(merged.classification.thresholds, userConfig.classification.thresholds);
      }
      if (userConfig.classification.weights) {
        Object.assign(merged.classification.weights, userConfig.classification.weights);
      }
    }

    // Merge rendering config
    if (userConfig.rendering) {
      Object.assign(merged.rendering, userConfig.rendering);
    }

    // Add GitHub token
    merged.github = {
      token: userConfig.github?.token || process.env.GITHUB_TOKEN || ''
    };

    return merged;
  }

  /**
   * Validate configuration file without loading
   */
  validateConfigFile(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      this.loadConfig();
    } catch (error) {
      if (error instanceof ValidationError) {
        errors.push(error.message);
      } else {
        errors.push(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

/**
 * Load and validate data files
 */
export class DataLoader {
  private dataDir: string;

  constructor(dataDir: string = 'data') {
    this.dataDir = dataDir;
  }

  /**
   * Load items.yml with validation
   */
  loadItems(): GhostItem[] {
    try {
      const content = readFileSync(join(this.dataDir, 'items.yml'), 'utf-8');
      return validateItemsYaml(content);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new Error(`Invalid items.yml: ${error.message}`);
      }
      throw new Error(`Failed to load items.yml: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load overrides.yml with validation
   */
  loadOverrides(): Override[] {
    try {
      const content = readFileSync(join(this.dataDir, 'overrides.yml'), 'utf-8');
      return validateOverridesYaml(content);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new Error(`Invalid overrides.yml: ${error.message}`);
      }
      throw new Error(`Failed to load overrides.yml: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load ignore.yml with validation
   */
  loadIgnoreRules(): IgnoreRule {
    try {
      const content = readFileSync(join(this.dataDir, 'ignore.yml'), 'utf-8');
      return validateIgnoreYaml(content);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new Error(`Invalid ignore.yml: ${error.message}`);
      }
      throw new Error(`Failed to load ignore.yml: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load sources.yml with validation
   */
  loadSources(): SearchQuery[] {
    try {
      const content = readFileSync(join(this.dataDir, 'sources.yml'), 'utf-8');
      return validateSourcesYaml(content);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new Error(`Invalid sources.yml: ${error.message}`);
      }
      throw new Error(`Failed to load sources.yml: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load all data files
   */
  loadAll() {
    return {
      items: this.loadItems(),
      overrides: this.loadOverrides(),
      ignoreRules: this.loadIgnoreRules(),
      sources: this.loadSources()
    };
  }

  /**
   * Validate all data files without loading
   */
  validateAll(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      this.loadItems();
    } catch (error) {
      errors.push(`items.yml: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      this.loadOverrides();
    } catch (error) {
      errors.push(`overrides.yml: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      this.loadIgnoreRules();
    } catch (error) {
      errors.push(`ignore.yml: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      this.loadSources();
    } catch (error) {
      errors.push(`sources.yml: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Create default data files if they don't exist
   */
  createDefaultDataFiles(): void {
    const defaultFiles = {
      'items.yml': '# Ghost CMS items discovered by the system\n# This file is automatically managed\n[]',
      'overrides.yml': '# Manual overrides for discovered items\n# Add entries here to customize item properties\n[]',
      'ignore.yml': '# Repositories to ignore during discovery\nrepos: []\npatterns: []',
      'sources.yml': `# Search queries for discovering Ghost themes
- query: "ghost theme in:name,description,readme language:handlebars"
  maxResults: 100
  minStars: 5
- query: "ghost-theme topic:ghost"
  maxResults: 50
  minStars: 10
- query: "ghost cms theme"
  maxResults: 50
  minStars: 5`
    };

    for (const [filename, content] of Object.entries(defaultFiles)) {
      const filePath = join(this.dataDir, filename);
      if (!existsSync(filePath)) {
        writeFileSync(filePath, content, 'utf-8');
      }
    }
  }
}

/**
 * Create crawler configuration from loaded data
 */
export function createCrawlerConfig(sources: SearchQuery[]): CrawlerConfig {
  return {
    queries: sources,
    rateLimit: DEFAULT_CONFIG.crawler.rateLimit,
    cache: DEFAULT_CONFIG.crawler.cache
  };
}

/**
 * Validate environment variables
 */
export function validateEnvironment(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!process.env.GITHUB_TOKEN) {
    errors.push('GITHUB_TOKEN environment variable is required');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get configuration with environment validation
 */
export function getConfig(): SystemConfig {
  const envValidation = validateEnvironment();
  if (!envValidation.valid) {
    throw new Error(`Environment validation failed: ${envValidation.errors.join(', ')}`);
  }

  const configManager = new ConfigManager();
  return configManager.loadConfig();
}

/**
 * Get configuration and data with full validation
 */
export function getConfigAndData() {
  const config = getConfig();
  
  const dataLoader = new DataLoader();
  const dataValidation = dataLoader.validateAll();
  if (!dataValidation.valid) {
    throw new Error(`Data validation failed: ${dataValidation.errors.join(', ')}`);
  }

  const data = dataLoader.loadAll();

  return {
    config,
    data
  };
}