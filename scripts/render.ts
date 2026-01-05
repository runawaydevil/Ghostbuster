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
   * Find outermost {{#each}} block (first one encountered)
   */
  private findOutermostEachBlock(text: string): { start: number; end: number; path: string; content: string } | null {
    const eachRegex = /\{\{#each\s+([^}]+)\}\}/;
    const match = eachRegex.exec(text);
    
    if (!match) return null;
    
    const start = match.index;
    const path = match[1].trim();
    let depth = 1;
    let pos = match.index + match[0].length;
    
    // Find matching {{/each}} by counting nesting levels
    while (depth > 0 && pos < text.length) {
      const nextEach = text.indexOf('{{#each', pos);
      const nextEnd = text.indexOf('{{/each}}', pos);
      
      if (nextEnd === -1) break;
      
      if (nextEach !== -1 && nextEach < nextEnd) {
        depth++;
        pos = nextEach + 7;
      } else {
        depth--;
        if (depth === 0) {
          const content = text.substring(start + match[0].length, nextEnd);
          return { start, end: nextEnd + 9, path, content };
        }
        pos = nextEnd + 9;
      }
    }
    
    return null;
  }

  /**
   * Render template with data
   */
  render(template: string, data: any): string {
    let result = template;

    // Step 1: Process {{#each}} blocks from outermost to innermost
    // This ensures outer blocks are processed before inner ones
    while (result.includes('{{#each')) {
      const block = this.findOutermostEachBlock(result);
      
      if (!block) {
        // No more processable blocks found, break to avoid infinite loop
        break;
      }
      
      // Resolve array path
      let array: any;
      if (block.path.startsWith('this.')) {
        const prop = block.path.substring(5);
        const thisContext = (data as any)['this'];
        if (thisContext) {
          array = this.getNestedValue(thisContext, prop);
        } else {
          // No 'this' context, remove the block
          result = result.substring(0, block.start) + '' + result.substring(block.end);
          continue;
        }
      } else {
        // Try to get from data directly first (for properties like 'items', 'themes' that are on the current context)
        array = data[block.path];
        // If not found directly, try getNestedValue for nested paths
        if (array === undefined) {
          array = this.getNestedValue(data, block.path);
        }
        // Also check if it's a property of 'this' if 'this' exists
        if (array === undefined && (data as any)['this']) {
          const thisObj = (data as any)['this'];
          if (thisObj && typeof thisObj === 'object') {
            array = thisObj[block.path];
          }
        }
      }
      
      if (!Array.isArray(array)) {
        // Not an array, remove the block
        result = result.substring(0, block.start) + '' + result.substring(block.end);
        continue;
      }
      
      // Process each item in the array
      const rendered = array.map(item => {
        // In Handlebars, within {{#each}}, the context becomes the current item
        // So we create a new context where the item's properties are directly accessible
        // Start with the item's properties directly (this is the Handlebars way)
        const itemContext: any = {};
        
        // First, make ALL properties of the item directly accessible
        // This allows {{name}}, {{items}}, {{themes}}, etc. to work directly
        if (item && typeof item === 'object') {
          // Use Object.keys to get all enumerable properties including non-own properties if needed
          const itemKeys = Object.keys(item);
          for (const key of itemKeys) {
            itemContext[key] = (item as any)[key];
          }
          // Also check for Symbol properties if any
          const symbols = Object.getOwnPropertySymbols(item);
          for (const sym of symbols) {
            itemContext[sym] = (item as any)[sym];
          }
        }
        
        // Set 'this' to the current item (for {{this.property}} syntax)
        itemContext['this'] = item;
        
        // Copy parent context properties (for ../ access and other parent data)
        // But don't overwrite item properties that we just set
        for (const key in data) {
          if (key !== 'this' && !(key in itemContext) && Object.prototype.hasOwnProperty.call(data, key)) {
            itemContext[key] = data[key];
          }
        }
        
        // Process the content with this item's context
        // This will recursively handle nested {{#each}} blocks and variables
        return this.render(block.content, itemContext);
      }).join('');
      
      // Replace the block with rendered content
      result = result.substring(0, block.start) + rendered + result.substring(block.end);
    }

    // Step 2: Replace simple variables {{variable}} and {{this.property}}
    result = result.replace(/\{\{([^#/\s}]+)\}\}/g, (match, key) => {
      const path = key.trim();
      let value: any;
      
      // Handle 'this.property' paths
      if (path.startsWith('this.')) {
        const prop = path.substring(5);
        const thisContext = (data as any)['this'];
        if (thisContext) {
          value = this.getNestedValue(thisContext, prop);
        }
      } else {
        value = this.getNestedValue(data, path);
      }
      
      return value !== undefined ? String(value) : '';
    });

    // Step 3: Handle conditional blocks {{#if condition}}...{{/if}}
    result = result.replace(/\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, content) => {
      const value = this.getNestedValue(data, condition.trim());
      return value ? content : '';
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
    for (const [, categoryItems] of categoryMap) {
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
      lastUpdate?: string;
    } = {}
  ): string {
    const template = readFileSync(templatePath, 'utf-8');
    
    const categories = this.organizeByCategory(items);
    const useCases = this.generateUseCases(items);
    const tools = this.getDefaultTools();
    const selectionNotes = this.getDefaultSelectionNotes();

    // Use provided lastUpdate or generate from current date
    let lastUpdate = options.lastUpdate;
    
    if (!lastUpdate) {
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
      const day = now.getUTCDate();
      const hours = String(now.getUTCHours()).padStart(2, '0');
      const minutes = String(now.getUTCMinutes()).padStart(2, '0');
      lastUpdate = `${month} ${day}, ${year} at ${hours}:${minutes} UTC`;
    }

    const templateData: TemplateData = {
      title: options.title || 'Le Ghost - Ghost CMS Themes & Tools Directory',
      subtitle: options.subtitle || 'Ghost CMS Themes & Tools Directory (2022–2026)',
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
      lastUpdate?: string;
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