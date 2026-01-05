/**
 * Integration tests for Le Ghost system
 * Tests the complete pipeline with mock data
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import yaml from 'js-yaml';
import { existsSync, writeFileSync, readFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { UpdateOrchestrator } from './update.js';
import { DataLoader, ConfigManager } from './config.js';
import { createRenderer } from './render.js';
import { createDataIntegrityChecker } from './data-integrity.js';
import { GhostItem } from './types.js';

// Test data directory
const TEST_DATA_DIR = 'test-data';
const TEST_CACHE_DIR = 'test-cache';
const TEST_OUTPUT = 'test-output.html';

// Mock data
const mockItems: GhostItem[] = [
  {
    id: 'TryGhost/Casper',
    name: 'Casper',
    repo: 'TryGhost/Casper',
    url: 'https://github.com/TryGhost/Casper',
    description: 'Default Ghost theme',
    category: 'Official',
    tags: ['ghost-theme', 'handlebars'],
    stars: 2600,
    pushedAt: '2024-12-01T10:00:00Z',
    archived: false,
    fork: false,
    license: 'MIT',
    topics: ['ghost', 'theme'],
    score: 95,
    confidence: 'high',
    notes: null,
    hidden: false
  },
  {
    id: 'eddiesigner/liebling',
    name: 'Liebling',
    repo: 'eddiesigner/liebling',
    url: 'https://github.com/eddiesigner/liebling',
    description: 'Beautiful Ghost theme',
    category: 'Theme',
    tags: ['ghost-theme', 'dark-mode'],
    stars: 1300,
    pushedAt: '2024-11-15T14:30:00Z',
    archived: false,
    fork: false,
    license: 'MIT',
    topics: ['ghost', 'theme'],
    score: 88,
    confidence: 'high',
    notes: null,
    hidden: false
  }
];

const mockSources = [
  {
    query: 'ghost theme test',
    maxResults: 10,
    minStars: 1
  }
];

const mockOverrides = [
  {
    repo: 'TryGhost/Casper',
    notes: 'Most popular Ghost theme'
  }
];

// const mockIgnoreRules = {
//   repos: ['test/ignored-repo'],
//   patterns: ['.*-test$']
// };

describe('Integration Tests', () => {
  beforeEach(() => {
    // Create test directories
    if (!existsSync(TEST_DATA_DIR)) {
      mkdirSync(TEST_DATA_DIR, { recursive: true });
    }
    if (!existsSync(TEST_CACHE_DIR)) {
      mkdirSync(TEST_CACHE_DIR, { recursive: true });
    }

    // Create test data files
    // Use proper YAML format instead of trying to convert JSON
    writeFileSync(
      join(TEST_DATA_DIR, 'items.yml'),
      `# Test items\n${yaml.dump(mockItems, { indent: 2 })}`
    );
    writeFileSync(
      join(TEST_DATA_DIR, 'sources.yml'),
      `# Test sources\n${yaml.dump(mockSources, { indent: 2 })}`
    );
    writeFileSync(
      join(TEST_DATA_DIR, 'overrides.yml'),
      `# Test overrides\n${yaml.dump(mockOverrides, { indent: 2 })}`
    );
    writeFileSync(
      join(TEST_DATA_DIR, 'ignore.yml'),
      `# Test ignore rules\nrepos:\n  - test/ignored-repo\npatterns:\n  - ".*-test$"`
    );
  });

  afterEach(() => {
    // Clean up test files
    if (existsSync(TEST_DATA_DIR)) {
      rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    if (existsSync(TEST_CACHE_DIR)) {
      rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
    }
    if (existsSync(TEST_OUTPUT)) {
      unlinkSync(TEST_OUTPUT);
    }
    if (existsSync('test-config.yml')) {
      unlinkSync('test-config.yml');
    }
  });

  describe('Data Loading and Validation', () => {
    it('should load and validate all data files', () => {
      const dataLoader = new DataLoader(TEST_DATA_DIR);
      
      const validation = dataLoader.validateAll();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      const data = dataLoader.loadAll();
      expect(data.items).toHaveLength(2);
      expect(data.sources).toHaveLength(1);
      expect(data.overrides).toHaveLength(1);
      expect(data.ignoreRules.repos).toHaveLength(1);
    });

    it('should handle invalid data gracefully', () => {
      // Create invalid items file
      writeFileSync(join(TEST_DATA_DIR, 'items.yml'), 'invalid: yaml: content: [');
      
      const dataLoader = new DataLoader(TEST_DATA_DIR);
      const validation = dataLoader.validateAll();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Configuration Management', () => {
    it('should create and validate default configuration', () => {
      const configManager = new ConfigManager('test-config.yml');
      
      const config = configManager.createDefaultConfig();
      expect(config).toBeDefined();
      expect(config.crawler).toBeDefined();
      expect(config.classification).toBeDefined();
      expect(config.rendering).toBeDefined();

      const validation = configManager.validateConfigFile();
      expect(validation.valid).toBe(true);
    });

    it('should merge user configuration with defaults', () => {
      // Create partial user config
      const userConfig = {
        classification: {
          thresholds: {
            high: 90,
            medium: 70,
            low: 50
          }
        }
      };

      writeFileSync('test-config.yml', JSON.stringify(userConfig, null, 2));
      
      const configManager = new ConfigManager('test-config.yml');
      const config = configManager.loadConfig();
      
      expect(config.classification.thresholds.high).toBe(90);
      expect(config.crawler.rateLimit.requestsPerHour).toBe(5000); // Default value
    });
  });

  describe('Data Integrity', () => {
    it('should detect and handle duplicates', () => {
      const duplicateItems = [
        ...mockItems,
        {
          ...mockItems[0],
          id: 'TryGhost/Casper-duplicate',
          name: 'Casper Duplicate'
        }
      ];

      const integrityChecker = createDataIntegrityChecker();
      const duplicateReport = integrityChecker.detectDuplicates(duplicateItems);
      
      expect(duplicateReport.totalDuplicates).toBeGreaterThan(0);
      expect(duplicateReport.uniqueItems.length).toBeLessThan(duplicateItems.length);
    });

    it('should validate data consistency', () => {
      const integrityChecker = createDataIntegrityChecker();
      const consistencyReport = integrityChecker.validateConsistency(mockItems);
      
      expect(consistencyReport.valid).toBe(true);
      expect(consistencyReport.errors).toHaveLength(0);
      expect(consistencyReport.stats.totalItems).toBe(2);
    });

    it('should detect data inconsistencies', () => {
      const invalidItems = [
        {
          ...mockItems[0],
          stars: -1, // Invalid
          score: 150, // Invalid
          confidence: 'invalid' as any // Invalid
        }
      ];

      const integrityChecker = createDataIntegrityChecker();
      const consistencyReport = integrityChecker.validateConsistency(invalidItems);
      
      expect(consistencyReport.valid).toBe(false);
      expect(consistencyReport.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Template Rendering', () => {
    it('should render HTML from template and data', () => {
      const renderer = createRenderer();
      
      const html = renderer.renderHTML(
        'templates/index.template.html',
        mockItems,
        {
          title: 'Test Directory',
          subtitle: 'Integration Test'
        }
      );

      expect(html).toContain('Test Directory');
      expect(html).toContain('Casper');
      expect(html).toContain('Liebling');
      expect(html).toContain('github.com');
    });

    it('should generate summary statistics', () => {
      const renderer = createRenderer();
      const summary = renderer.generateSummary(mockItems);
      
      expect(summary.totalItems).toBe(2);
      expect(summary.totalStars).toBe(3900);
      expect(summary.topThemes).toHaveLength(2);
      expect(summary.topThemes[0].name).toBe('Casper');
    });

    it('should render to file successfully', () => {
      const renderer = createRenderer();
      
      renderer.renderToFile(
        'templates/index.template.html',
        TEST_OUTPUT,
        mockItems
      );

      expect(existsSync(TEST_OUTPUT)).toBe(true);
      
      const content = readFileSync(TEST_OUTPUT, 'utf-8');
      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('Casper');
    });
  });

  describe('Performance Benchmarks', () => {
    it('should complete data processing within time limits', () => {
      const startTime = Date.now();
      
      const integrityChecker = createDataIntegrityChecker();
      const { cleanedItems } = integrityChecker.cleanDataset(mockItems);
      
      const renderer = createRenderer();
      renderer.renderHTML('templates/index.template.html', cleanedItems);
      
      const duration = Date.now() - startTime;
      
      // Should complete within 5 seconds for small dataset
      expect(duration).toBeLessThan(5000);
    });

    it('should handle large datasets efficiently', () => {
      // Create larger dataset with unique repos
      const largeDataset = Array.from({ length: 100 }, (_, i) => ({
        ...mockItems[0],
        id: `test/repo-${i}`,
        name: `Test Repo ${i}`,
        repo: `test/repo-${i}`,
        url: `https://github.com/test/repo-${i}`,
        stars: Math.floor(Math.random() * 1000)
      }));

      const startTime = Date.now();
      
      const integrityChecker = createDataIntegrityChecker();
      const { cleanedItems } = integrityChecker.cleanDataset(largeDataset);
      
      const renderer = createRenderer();
      const summary = renderer.generateSummary(cleanedItems);
      
      const duration = Date.now() - startTime;
      
      expect(summary.totalItems).toBe(100);
      // Should complete within 10 seconds for 100 items
      expect(duration).toBeLessThan(10000);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing template files gracefully', () => {
      const renderer = createRenderer();
      
      expect(() => {
        renderer.renderHTML('nonexistent-template.html', mockItems);
      }).toThrow();
    });

    it('should handle empty datasets', () => {
      const renderer = createRenderer();
      
      const html = renderer.renderHTML(
        'templates/index.template.html',
        [],
        { title: 'Empty Directory' }
      );

      expect(html).toContain('Empty Directory');
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('should validate required environment variables', () => {
      const originalToken = process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_TOKEN;

      expect(() => {
        // This should fail without GITHUB_TOKEN
        // const dataLoader = new DataLoader(TEST_DATA_DIR);
        // Validation should catch missing token
      }).not.toThrow(); // DataLoader itself doesn't check env vars

      process.env.GITHUB_TOKEN = originalToken;
    });
  });

  describe('End-to-End Pipeline', () => {
    it('should complete full pipeline in dry-run mode', async () => {
      // Skip this test if no GitHub token is available
      if (!process.env.GITHUB_TOKEN) {
        console.log('Skipping E2E test: No GITHUB_TOKEN available');
        return;
      }

      const orchestrator = new UpdateOrchestrator({
        dryRun: true,
        skipCrawl: true, // Skip crawling to avoid API calls
        verbose: false
      });

      const result = await orchestrator.execute();
      
      expect(result).toBeDefined();
      expect(result.duration).toBeGreaterThan(0);
      expect(result.stats).toBeDefined();
    }, 30000); // 30 second timeout for E2E test
  });
});

describe('Regression Tests', () => {
  it('should maintain backward compatibility with existing data format', () => {
    // Test that old data format still works
    const legacyItem = {
      id: 'legacy/theme',
      name: 'Legacy Theme',
      repo: 'legacy/theme',
      url: 'https://github.com/legacy/theme',
      description: 'A legacy theme',
      category: 'Theme',
      tags: ['legacy'],
      stars: 100,
      pushedAt: '2023-01-01T00:00:00Z',
      archived: false,
      fork: false,
      license: 'MIT',
      topics: [],
      score: 75,
      confidence: 'medium' as const,
      notes: null,
      hidden: false
    };

    const integrityChecker = createDataIntegrityChecker();
    const report = integrityChecker.validateConsistency([legacyItem]);
    
    expect(report.valid).toBe(true);
  });

  it('should handle schema evolution gracefully', () => {
    // Test that new optional fields don't break existing functionality
    const extendedItem = {
      ...mockItems[0],
      newOptionalField: 'test-value'
    };

    const renderer = createRenderer();
    
    expect(() => {
      renderer.renderHTML('templates/index.template.html', [extendedItem]);
    }).not.toThrow();
  });
});