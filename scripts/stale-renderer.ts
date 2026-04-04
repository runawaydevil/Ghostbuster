
import { readFileSync, writeFileSync } from 'fs';
import { StaleItem } from './types.js';
import { TemplateRenderer, CategoryGroup } from './render.js';

export interface StaleRenderOptions {
  title?: string;
  subtitle?: string;
  warningMessage?: string;
  lastUpdate?: string;
  thresholdMonths?: number;
  statistics?: {
    totalStale: number;
    percentageOfTotal: number;
    averageMonthsStale: number;
  };
  logoUrl?: string;
  githubUrl?: string;
  maintainerName?: string;
  maintainerUrl?: string;
  contactEmail?: string;
}

export interface StaleStatistics {
  totalStale: number;
  percentageOfTotal: number;
  byCategory: Record<string, number>;
  averageMonthsStale: number;
}

interface Tool {
  name: string;
  url: string;
  description: string;
  pushedAt: string;
  monthsStale?: number;
}

interface StaleTemplateData {
  title: string;
  subtitle: string;
  logoUrl: string;
  logoAlt: string;
  githubUrl: string;
  warningMessage: string;
  thresholdMonths: number;
  lastUpdate: string;
  categories: CategoryGroup[];
  tools: Tool[];
  statistics?: {
    totalStale: number;
    percentageOfTotal: number;
    averageMonthsStale: number;
  };
  dataSource: string;
  maintainerName: string;
  maintainerUrl: string;
  contactEmail: string;
  licenseName: string;
  licenseUrl: string;
}

export class StaleDirectoryRenderer {
  private renderer: TemplateRenderer;

  constructor() {
    this.renderer = new TemplateRenderer();
  }

  organizeByCategory(items: StaleItem[]): CategoryGroup[] {
    const categoryMap = new Map<string, StaleItem[]>();

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

  generateStatistics(staleItems: StaleItem[], totalItems: number): StaleStatistics {
    const visibleStaleItems = staleItems.filter(item => !item.hidden);
    const totalStale = visibleStaleItems.length;

    // Calculate percentage of total
    const percentageOfTotal = totalItems > 0 
      ? Math.round((totalStale / totalItems) * 100 * 10) / 10 
      : 0;

    // Count by category
    const byCategory: Record<string, number> = {};
    for (const item of visibleStaleItems) {
      const category = item.category || 'Other';
      byCategory[category] = (byCategory[category] || 0) + 1;
    }

    // Calculate average months stale
    const totalMonths = visibleStaleItems.reduce((sum, item) => sum + item.monthsStale, 0);
    const averageMonthsStale = totalStale > 0 
      ? Math.round((totalMonths / totalStale) * 10) / 10 
      : 0;

    return {
      totalStale,
      percentageOfTotal,
      byCategory,
      averageMonthsStale
    };
  }

  private separateThemesAndTools(items: StaleItem[]): { themes: StaleItem[]; tools: Tool[] } {
    const themes: StaleItem[] = [];
    const tools: Tool[] = [];

    for (const item of items) {
      if (item.hidden) continue;

      if (item.category === 'Tool') {
        tools.push({
          name: item.name,
          url: item.url,
          description: item.description || '',
          pushedAt: this.formatDate(item.pushedAt),
          monthsStale: item.monthsStale
        });
      } else {
        themes.push(item);
      }
    }

    return { themes, tools };
  }

  private formatDate(isoDate: string): string {
    try {
      const date = new Date(isoDate);
      const year = date.getUTCFullYear();
      const month = date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
      const day = date.getUTCDate();
      return `${month} ${day}, ${year}`;
    } catch {
      return isoDate;
    }
  }

  private generateLastUpdate(providedUpdate?: string): string {
    if (providedUpdate) {
      return providedUpdate;
    }

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
    const day = now.getUTCDate();
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    return `${month} ${day}, ${year} at ${hours}:${minutes} UTC`;
  }

  renderToFile(
    templatePath: string,
    outputPath: string,
    staleItems: StaleItem[],
    options: StaleRenderOptions = {}
  ): void {
    // Read template
    const template = readFileSync(templatePath, 'utf-8');

    // Separate themes and tools
    const { themes, tools } = this.separateThemesAndTools(staleItems);

    // Organize themes by category
    const categories = this.organizeByCategory(themes);

    // Format items with human-readable dates
    for (const category of categories) {
      for (const item of category.items) {
        // Add formatted date for display
        (item as any).pushedAt = this.formatDate(item.pushedAt);
      }
    }

    // Generate last update timestamp
    const lastUpdate = this.generateLastUpdate(options.lastUpdate);

    // Build template data
    const templateData: StaleTemplateData = {
      title: options.title || 'Ghostbuster - Not Updated Recently',
      subtitle: options.subtitle || 'Ghost CMS Themes & Tools Not Updated Recently',
      logoUrl: options.logoUrl || 'https://shot.1208.pro/uploads/a2PdvxHdlh874E85270Imhqsww1Q2KPn6vgk7V3x.png',
      logoAlt: 'Ghostbuster logo',
      githubUrl: options.githubUrl || 'https://github.com/runawaydevil/Ghostbuster',
      warningMessage: options.warningMessage || 'These items have not been updated in over 12 months. They may still work but are not actively maintained.',
      thresholdMonths: options.thresholdMonths || 12,
      lastUpdate,
      categories,
      tools,
      statistics: options.statistics,
      dataSource: 'GitHub API & automated discovery',
      maintainerName: options.maintainerName || 'RunawayDevil',
      maintainerUrl: options.maintainerUrl || 'https://github.com/runawaydevil',
      contactEmail: options.contactEmail || 'runawaydevil@pm.me',
      licenseName: 'MIT License',
      licenseUrl: 'LICENSE'
    };

    // Render template
    const html = this.renderer.render(template, templateData);

    // Write to file
    writeFileSync(outputPath, html, 'utf-8');
  }
}

export function createStaleRenderer(): StaleDirectoryRenderer {
  return new StaleDirectoryRenderer();
}
