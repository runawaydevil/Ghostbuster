/**
 * Unit tests for StaleDirectoryRenderer
 * 
 * Tests HTML generation, statistics calculation, category organization,
 * and template rendering with various data sets.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StaleDirectoryRenderer, createStaleRenderer } from './stale-renderer.js';
import { StaleItem } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

describe('StaleDirectoryRenderer', () => {
  let renderer: StaleDirectoryRenderer;
  const testOutputDir = 'test-output';
  const testOutputPath = path.join(testOutputDir, 'test-stale.html');

  beforeEach(() => {
    renderer = createStaleRenderer();
    
    // Create test output directory
    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test output files
    if (fs.existsSync(testOutputPath)) {
      fs.unlinkSync(testOutputPath);
    }
    if (fs.existsSync(testOutputDir)) {
      fs.rmdirSync(testOutputDir);
    }
  });

  describe('organizeByCategory', () => {
    it('should organize items by category', () => {
      const items: StaleItem[] = [
        createStaleItem('theme1', 'Theme', 100),
        createStaleItem('theme2', 'Theme', 50),
        createStaleItem('tool1', 'Tool', 200),
        createStaleItem('official1', 'Official', 300),
      ];

      const categories = renderer.organizeByCategory(items);

      expect(categories).toHaveLength(3);
      expect(categories[0].name).toBe('OFFICIAL / TRYGHOST THEMES');
      expect(categories[0].items).toHaveLength(1);
      expect(categories[1].name).toBe('HIGHLY POPULAR COMMUNITY THEMES');
      expect(categories[1].items).toHaveLength(2);
      expect(categories[2].name).toBe('TOOLS & RESOURCES');
      expect(categories[2].items).toHaveLength(1);
    });

    it('should sort items within categories by stars descending', () => {
      const items: StaleItem[] = [
        createStaleItem('theme1', 'Theme', 50),
        createStaleItem('theme2', 'Theme', 200),
        createStaleItem('theme3', 'Theme', 100),
      ];

      const categories = renderer.organizeByCategory(items);

      expect(categories).toHaveLength(1);
      expect(categories[0].items[0].stars).toBe(200);
      expect(categories[0].items[1].stars).toBe(100);
      expect(categories[0].items[2].stars).toBe(50);
    });

    it('should skip hidden items', () => {
      const items: StaleItem[] = [
        createStaleItem('theme1', 'Theme', 100),
        { ...createStaleItem('theme2', 'Theme', 50), hidden: true },
        createStaleItem('theme3', 'Theme', 75),
      ];

      const categories = renderer.organizeByCategory(items);

      expect(categories).toHaveLength(1);
      expect(categories[0].items).toHaveLength(2);
      expect(categories[0].items.find(item => item.name === 'theme2')).toBeUndefined();
    });

    it('should handle empty items array', () => {
      const categories = renderer.organizeByCategory([]);
      expect(categories).toHaveLength(0);
    });

    it('should handle custom categories', () => {
      const items: StaleItem[] = [
        createStaleItem('custom1', 'Custom', 100),
        createStaleItem('custom2', 'Custom', 50),
      ];

      const categories = renderer.organizeByCategory(items);

      expect(categories).toHaveLength(1);
      expect(categories[0].name).toBe('CUSTOM THEMES');
      expect(categories[0].items).toHaveLength(2);
    });
  });

  describe('generateStatistics', () => {
    it('should calculate correct statistics', () => {
      const items: StaleItem[] = [
        createStaleItem('theme1', 'Theme', 100, 12),
        createStaleItem('theme2', 'Theme', 50, 18),
        createStaleItem('tool1', 'Tool', 200, 24),
      ];

      const stats = renderer.generateStatistics(items, 10);

      expect(stats.totalStale).toBe(3);
      expect(stats.percentageOfTotal).toBe(30.0); // 3/10 * 100 = 30%
      expect(stats.averageMonthsStale).toBe(18.0); // (12 + 18 + 24) / 3 = 18
      expect(stats.byCategory).toEqual({
        Theme: 2,
        Tool: 1,
      });
    });

    it('should handle zero total items', () => {
      const items: StaleItem[] = [
        createStaleItem('theme1', 'Theme', 100, 12),
      ];

      const stats = renderer.generateStatistics(items, 0);

      expect(stats.totalStale).toBe(1);
      expect(stats.percentageOfTotal).toBe(0);
    });

    it('should exclude hidden items from statistics', () => {
      const items: StaleItem[] = [
        createStaleItem('theme1', 'Theme', 100, 12),
        { ...createStaleItem('theme2', 'Theme', 50, 18), hidden: true },
        createStaleItem('theme3', 'Theme', 75, 15),
      ];

      const stats = renderer.generateStatistics(items, 10);

      expect(stats.totalStale).toBe(2);
      expect(stats.averageMonthsStale).toBe(13.5); // (12 + 15) / 2 = 13.5
    });

    it('should handle empty items array', () => {
      const stats = renderer.generateStatistics([], 10);

      expect(stats.totalStale).toBe(0);
      expect(stats.percentageOfTotal).toBe(0);
      expect(stats.averageMonthsStale).toBe(0);
      expect(stats.byCategory).toEqual({});
    });

    it('should round percentage to one decimal place', () => {
      const items: StaleItem[] = [
        createStaleItem('theme1', 'Theme', 100, 12),
      ];

      const stats = renderer.generateStatistics(items, 3);

      expect(stats.percentageOfTotal).toBe(33.3); // 1/3 * 100 = 33.333... rounded to 33.3
    });

    it('should round average months to one decimal place', () => {
      const items: StaleItem[] = [
        createStaleItem('theme1', 'Theme', 100, 10),
        createStaleItem('theme2', 'Theme', 50, 11),
        createStaleItem('theme3', 'Theme', 75, 12),
      ];

      const stats = renderer.generateStatistics(items, 10);

      expect(stats.averageMonthsStale).toBe(11.0); // (10 + 11 + 12) / 3 = 11
    });
  });

  describe('renderToFile', () => {
    it('should generate HTML file with stale items', () => {
      const items: StaleItem[] = [
        createStaleItem('theme1', 'Theme', 100, 12),
        createStaleItem('tool1', 'Tool', 200, 18),
      ];

      const templatePath = 'templates/stale.template.html';
      
      // Skip test if template doesn't exist
      if (!fs.existsSync(templatePath)) {
        console.log('Skipping test: template file not found');
        return;
      }

      renderer.renderToFile(templatePath, testOutputPath, items, {
        title: 'Test Stale Items',
        subtitle: 'Test Subtitle',
        warningMessage: 'Test warning',
        thresholdMonths: 12,
      });

      expect(fs.existsSync(testOutputPath)).toBe(true);

      const html = fs.readFileSync(testOutputPath, 'utf-8');
      expect(html).toContain('Test Stale Items');
      expect(html).toContain('Test Subtitle');
      expect(html).toContain('Test warning');
      expect(html).toContain('theme1');
      expect(html).toContain('tool1');
    });

    it('should include statistics in rendered HTML', () => {
      const items: StaleItem[] = [
        createStaleItem('theme1', 'Theme', 100, 12),
        createStaleItem('theme2', 'Theme', 50, 18),
      ];

      const templatePath = 'templates/stale.template.html';
      
      // Skip test if template doesn't exist
      if (!fs.existsSync(templatePath)) {
        console.log('Skipping test: template file not found');
        return;
      }

      const stats = renderer.generateStatistics(items, 10);

      renderer.renderToFile(templatePath, testOutputPath, items, {
        statistics: stats,
      });

      expect(fs.existsSync(testOutputPath)).toBe(true);

      const html = fs.readFileSync(testOutputPath, 'utf-8');
      expect(html).toContain('2'); // totalStale
      expect(html).toContain('20'); // percentageOfTotal
      expect(html).toContain('15'); // averageMonthsStale
    });

    it('should handle empty items array', () => {
      const templatePath = 'templates/stale.template.html';
      
      // Skip test if template doesn't exist
      if (!fs.existsSync(templatePath)) {
        console.log('Skipping test: template file not found');
        return;
      }

      renderer.renderToFile(templatePath, testOutputPath, []);

      expect(fs.existsSync(testOutputPath)).toBe(true);

      const html = fs.readFileSync(testOutputPath, 'utf-8');
      expect(html).toContain('Le Ghost'); // Should still have basic structure
    });

    it('should use default options when not provided', () => {
      const items: StaleItem[] = [
        createStaleItem('theme1', 'Theme', 100, 12),
      ];

      const templatePath = 'templates/stale.template.html';
      
      // Skip test if template doesn't exist
      if (!fs.existsSync(templatePath)) {
        console.log('Skipping test: template file not found');
        return;
      }

      renderer.renderToFile(templatePath, testOutputPath, items);

      expect(fs.existsSync(testOutputPath)).toBe(true);

      const html = fs.readFileSync(testOutputPath, 'utf-8');
      expect(html).toContain('Le Ghost - Not Updated Recently');
      expect(html).toContain('12 months'); // Default threshold
    });

    it('should format dates in human-readable format', () => {
      const items: StaleItem[] = [
        {
          ...createStaleItem('theme1', 'Theme', 100, 12),
          pushedAt: '2023-01-15T10:30:00Z',
        },
      ];

      const templatePath = 'templates/stale.template.html';
      
      // Skip test if template doesn't exist
      if (!fs.existsSync(templatePath)) {
        console.log('Skipping test: template file not found');
        return;
      }

      renderer.renderToFile(templatePath, testOutputPath, items);

      expect(fs.existsSync(testOutputPath)).toBe(true);

      const html = fs.readFileSync(testOutputPath, 'utf-8');
      expect(html).toContain('January 15, 2023');
    });

    it('should separate themes and tools into different sections', () => {
      const items: StaleItem[] = [
        createStaleItem('theme1', 'Theme', 100, 12),
        createStaleItem('tool1', 'Tool', 200, 18),
        createStaleItem('theme2', 'Theme', 50, 15),
      ];

      const templatePath = 'templates/stale.template.html';
      
      // Skip test if template doesn't exist
      if (!fs.existsSync(templatePath)) {
        console.log('Skipping test: template file not found');
        return;
      }

      renderer.renderToFile(templatePath, testOutputPath, items);

      expect(fs.existsSync(testOutputPath)).toBe(true);

      const html = fs.readFileSync(testOutputPath, 'utf-8');
      
      // Check that themes section exists
      expect(html).toContain('STALE THEMES');
      expect(html).toContain('theme1');
      expect(html).toContain('theme2');
      
      // Check that tools section exists
      expect(html).toContain('STALE TOOLS');
      expect(html).toContain('tool1');
    });
  });

  describe('createStaleRenderer', () => {
    it('should create a StaleDirectoryRenderer instance', () => {
      const renderer = createStaleRenderer();
      expect(renderer).toBeInstanceOf(StaleDirectoryRenderer);
    });
  });
});

/**
 * Helper function to create a test StaleItem
 */
function createStaleItem(
  name: string,
  category: string,
  stars: number,
  monthsStale: number = 12
): StaleItem {
  const id = `test/${name}`;
  return {
    id,
    name,
    repo: id,
    url: `https://github.com/${id}`,
    description: `Test ${category} ${name}`,
    category,
    tags: ['ghost-theme', 'test'],
    stars,
    pushedAt: new Date(Date.now() - monthsStale * 30 * 24 * 60 * 60 * 1000).toISOString(),
    archived: false,
    fork: false,
    license: 'MIT',
    topics: ['ghost', 'theme'],
    score: 80,
    confidence: 'high',
    notes: null,
    hidden: false,
    staleDetectedAt: new Date().toISOString(),
    monthsStale,
  };
}
