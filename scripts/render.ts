/**
 * HTML template rendering engine for Le Ghost system
 */

import { readFileSync, writeFileSync } from 'fs';
import { GhostItem } from './types.js';

export interface RenderContext {
  items: GhostItem[];
  categories: CategoryGroup[];
  metadata: {
    lastUpdate: string;
    totalItems: number;
    dataSource: string;
  };
}

export interface CategoryGroup {
  name: string;
  items: GhostItem[];
}

export interface UseCase {
  name: string;
  themes: {
    name: string;
    description: string;
    stars: number;
  }[];
}

export interface Tool {
  name: string;
  url: string;
  description: string;
}

export interface TemplateData {
  title: string;
  subtitle: string;
  logoUrl: string;
  logoAlt: string;
  githubUrl: string;
  introText: string;
  updateMessage?: string;
  lastUpdate: string;
  categories: CategoryGroup[];
  tools: Tool[];
  useCases: UseCase[];
  selectionNotes: string[];
  dataSource: string;
  maintainerName: string;
  maintainerUrl: string;
  contactEmail: string;
  licenseName: string;
  licenseUrl: string;
}

/**
 * Simple Handlebars-like template renderer
 */
export class TemplateRenderer {
  
  /**
   * Render template with data
   */
  render(template: string, data: any): string {
    let result = template;

    // Replace simple variables {{variable}}
    result = result.replace(/\{\{([^#\/\s}]+)\}\}/g, (match, key) => {
      const value = this.getNestedValue(data, key.trim());
      return value !== undefined ? String(value) : '';
    });

    // Handle conditional blocks {{#if condition}}...{{/if}}
    result = result.replace(/\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, content) => {
      const value = this.getNestedValue(data, condition.trim());
      return value ? content : '';
    });

    // Handle each blocks {{#each array}}...{{/each}}
    result = result.replace(/\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, arrayPath, content) => {
      const array = this.getNestedValue(data, arrayPath.trim());
      if (!Array.isArray(array)) {
        return '';
      }

      return array.map(item => {
        let itemContent = content;
        
        // Replace {{this.property}} with item properties
        itemContent = itemContent.replace(/\{\{this\.([^}]+)\}\}/g, (match: string, prop: string) => {
          const value = this.getNestedValue(item, prop.trim());
          return value !== undefined ? String(value) : '';
        });

        // Replace {{this}} with the item itself (for primitive arrays)
        itemContent = itemContent.replace(/\{\{this\}\}/g, String(item));

        return itemContent;
      }).join('');
    });

    return result;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }
}

/**
 * HTML renderer for Ghost themes directory
 */
export class GhostDirectoryRenderer {
  private renderer: TemplateRenderer;

  constructor() {
    this.renderer = new TemplateRenderer();
  }

  /**
   * Organize items by category
   */
  private organizeByCategory(items: GhostItem[]): CategoryGroup[] {
    const categoryMap = new Map<string, GhostItem[]>();

    // Define category order and display names
    const categoryOrder = [
      { key: 'Official', name: 'OFFICIAL / TRYGHOST THEMES' },
      { key: 'Theme', name: 'HIGHLY POPULAR COMMUNITY THEMES' },
      { key: 'Tool', name: 'TOOLS & RESOURCES' },
      { key: 'Starter', name: 'STARTER & DEVELOPMENT THEMES' }
    ];

    // Group items by category
    for (const item of items) {
      if (item.hidden) continue; // Skip hidden items

      const category = item.category || 'Other';
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push(item);
    }

    // Sort items within each category by stars (descending)
    for (const [category, categoryItems] of categoryMap) {
      categoryItems.sort((a, b) => b.stars - a.stars);
    }

    // Create ordered category groups
    const categories: CategoryGroup[] = [];

    // Add predefined categories in order
    for (const { key, name } of categoryOrder) {
      const items = categoryMap.get(key);
      if (items && items.length > 0) {
        categories.push({ name, items });
        categoryMap.delete(key);
      }
    }

    // Add remaining categories
    for (const [key, items] of categoryMap) {
      if (items.length > 0) {
        categories.push({ 
          name: key.toUpperCase() + ' THEMES', 
          items 
        });
      }
    }

    return categories;
  }

  /**
   * Generate use cases from items
   */
  private generateUseCases(items: GhostItem[]): UseCase[] {
    const useCases: UseCase[] = [
      {
        name: 'Newsletter Themes',
        themes: items
          .filter(item => 
            item.tags.some(tag => tag.toLowerCase().includes('newsletter')) ||
            item.description?.toLowerCase().includes('newsletter') ||
            ['Dawn', 'Edition', 'Journal', 'Bulletin'].includes(item.name)
          )
          .slice(0, 5)
          .map(item => ({
            name: item.name,
            description: this.extractShortDescription(item),
            stars: item.stars
          }))
      },
      {
        name: 'Magazine / Publication Themes',
        themes: items
          .filter(item => 
            item.tags.some(tag => ['magazine', 'publication', 'editorial'].includes(tag.toLowerCase())) ||
            item.description?.toLowerCase().includes('magazine') ||
            ['London', 'Massively', 'Editorial', 'Simply', 'Mapache'].includes(item.name)
          )
          .slice(0, 7)
          .map(item => ({
            name: item.name,
            description: this.extractShortDescription(item),
            stars: item.stars
          }))
      },
      {
        name: 'Minimalist / Clean Themes',
        themes: items
          .filter(item => 
            item.tags.some(tag => ['minimal', 'clean', 'simple'].includes(tag.toLowerCase())) ||
            item.description?.toLowerCase().includes('minimal') ||
            ['Alto', 'MNML', 'Kaldorei', 'Caffeine'].includes(item.name)
          )
          .slice(0, 5)
          .map(item => ({
            name: item.name,
            description: this.extractShortDescription(item),
            stars: item.stars
          }))
      },
      {
        name: 'Portfolio / Creative Showcase',
        themes: items
          .filter(item => 
            item.tags.some(tag => ['portfolio', 'creative', 'showcase'].includes(tag.toLowerCase())) ||
            item.description?.toLowerCase().includes('portfolio') ||
            ['Edge', 'Prometheus'].includes(item.name)
          )
          .slice(0, 4)
          .map(item => ({
            name: item.name,
            description: this.extractShortDescription(item),
            stars: item.stars
          }))
      },
      {
        name: 'Specialized',
        themes: items
          .filter(item => 
            item.tags.some(tag => ['podcast', 'documentation', 'course'].includes(tag.toLowerCase())) ||
            ['Wave', 'Ease', 'X-Learn'].includes(item.name)
          )
          .slice(0, 5)
          .map(item => ({
            name: item.name,
            description: this.extractShortDescription(item),
            stars: item.stars
          }))
      }
    ];

    // Filter out empty use cases
    return useCases.filter(useCase => useCase.themes.length > 0);
  }

  /**
   * Extract short description from item
   */
  private extractShortDescription(item: GhostItem): string {
    if (item.notes) {
      return item.notes;
    }
    
    if (item.description) {
      // Take first sentence or first 50 characters
      const firstSentence = item.description.split('.')[0];
      return firstSentence.length > 50 ? 
        item.description.substring(0, 50) + '...' : 
        firstSentence;
    }

    return `${item.category} theme`;
  }

  /**
   * Get default tools list
   */
  private getDefaultTools(): Tool[] {
    return [
      {
        name: 'Ghost Theme Docs',
        url: 'https://docs.ghost.org/themes',
        description: 'Official documentation for Handlebars themes, theme structure, custom settings, and validation workflow'
      },
      {
        name: 'GScan (Theme Validation)',
        url: 'https://github.com/TryGhost/gscan',
        description: 'Validates themes for errors/deprecations; used by Ghost during theme upload'
      },
      {
        name: 'Deploy Ghost Themes (GitHub Actions)',
        url: 'https://github.com/TryGhost/action-deploy-theme',
        description: 'GitHub Action to automate theme deployment'
      },
      {
        name: 'Ghost Theme Locales',
        url: 'https://github.com/priority-vision/ghost-theme-locales',
        description: 'CLI helper for creating localization (locale) files'
      },
      {
        name: 'Awesome Ghost',
        url: 'https://github.com/awesomelistsio/awesome-ghost',
        description: 'Curated list of Ghost resources and community projects'
      }
    ];
  }

  /**
   * Get default selection notes
   */
  private getDefaultSelectionNotes(): string[] {
    return [
      '<strong>Official TryGhost themes</strong> are regularly maintained and well-documented.',
      '<strong>Community themes</strong> vary in maintenance; check last commit date and issue activity.',
      '<strong>Popular themes</strong> (1k+ stars) have larger user bases and active communities for support.',
      '<strong>Minimal themes</strong> prioritize typography and performance; suitable for blogs and newsletters.',
      '<strong>Magazine themes</strong> offer rich media layouts; ideal for publications and image-heavy content.',
      '<strong>Specialized themes</strong> (courses, podcasts, portfolios) may include built-in features for those use cases.',
      'Most themes use <strong>Handlebars</strong> templating; some newer ones support <strong>Tailwind CSS</strong> and build tools like <strong>Vite</strong>.'
    ];
  }

  /**
   * Render HTML from template and data
   */
  renderHTML(
    templatePath: string,
    items: GhostItem[],
    options: {
      title?: string;
      subtitle?: string;
      logoUrl?: string;
      githubUrl?: string;
      updateMessage?: string;
      maintainerName?: string;
      maintainerUrl?: string;
      contactEmail?: string;
    } = {}
  ): string {
    const template = readFileSync(templatePath, 'utf-8');
    
    const categories = this.organizeByCategory(items);
    const useCases = this.generateUseCases(items);
    const tools = this.getDefaultTools();
    const selectionNotes = this.getDefaultSelectionNotes();

    const now = new Date();
    const lastUpdate = now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }) + ' at ' + now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC'
    }) + ' UTC';

    const templateData: TemplateData = {
      title: options.title || 'Le Ghost - Ghost CMS Themes & Tools Directory',
      subtitle: options.subtitle || 'Ghost CMS Themes & Tools Directory (Automated)',
      logoUrl: options.logoUrl || 'https://shot.1208.pro/uploads/a2PdvxHdlh874E85270Imhqsww1Q2KPn6vgk7V3x.png',
      logoAlt: 'Le Ghost Logo',
      githubUrl: options.githubUrl || 'https://github.com/runawaydevil/le-ghost',
      introText: 'This document is a curated directory of Ghost CMS theme repositories and essential tools/resources for theme development, validation, localization, and deployment. Organized to facilitate browsing by origin and category, identify popular themes, and discover tooling for building and maintaining Ghost themes.',
      updateMessage: options.updateMessage,
      lastUpdate,
      categories,
      tools,
      useCases,
      selectionNotes,
      dataSource: 'GitHub API & automated discovery',
      maintainerName: options.maintainerName || 'Le Ghost System',
      maintainerUrl: options.maintainerUrl || 'https://github.com/runawaydevil/le-ghost',
      contactEmail: options.contactEmail || 'runawaydevil@pm.me',
      licenseName: 'MIT License',
      licenseUrl: 'LICENSE'
    };

    return this.renderer.render(template, templateData);
  }

  /**
   * Render and save HTML file
   */
  renderToFile(
    templatePath: string,
    outputPath: string,
    items: GhostItem[],
    options: {
      title?: string;
      subtitle?: string;
      logoUrl?: string;
      githubUrl?: string;
      updateMessage?: string;
      maintainerName?: string;
      maintainerUrl?: string;
      contactEmail?: string;
    } = {}
  ): void {
    const html = this.renderHTML(templatePath, items, options);
    writeFileSync(outputPath, html, 'utf-8');
  }

  /**
   * Generate summary statistics
   */
  generateSummary(items: GhostItem[]): {
    totalItems: number;
    totalStars: number;
    categoryCounts: Record<string, number>;
    topThemes: { name: string; stars: number }[];
    recentlyUpdated: { name: string; pushedAt: string }[];
  } {
    const visibleItems = items.filter(item => !item.hidden);
    
    const categoryCounts: Record<string, number> = {};
    let totalStars = 0;

    for (const item of visibleItems) {
      const category = item.category || 'Other';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      totalStars += item.stars;
    }

    const topThemes = visibleItems
      .sort((a, b) => b.stars - a.stars)
      .slice(0, 10)
      .map(item => ({ name: item.name, stars: item.stars }));

    const recentlyUpdated = visibleItems
      .filter(item => item.pushedAt)
      .sort((a, b) => new Date(b.pushedAt!).getTime() - new Date(a.pushedAt!).getTime())
      .slice(0, 10)
      .map(item => ({ name: item.name, pushedAt: item.pushedAt! }));

    return {
      totalItems: visibleItems.length,
      totalStars,
      categoryCounts,
      topThemes,
      recentlyUpdated
    };
  }
}

/**
 * Create a Ghost directory renderer instance
 */
export function createRenderer(): GhostDirectoryRenderer {
  return new GhostDirectoryRenderer();
}