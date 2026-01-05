#!/usr/bin/env node

/**
 * Data migration script for Le Ghost
 * Converts existing HTML data to new YAML format
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { JSDOM } from 'jsdom';
import * as yaml from 'js-yaml';
import { GhostItem } from './types.js';

interface MigrationResult {
  success: boolean;
  itemsFound: number;
  itemsMigrated: number;
  errors: string[];
  warnings: string[];
}

/**
 * HTML to YAML data migrator
 */
export class DataMigrator {
  private errors: string[] = [];
  private warnings: string[] = [];

  /**
   * Extract theme data from existing HTML file
   */
  extractFromHTML(htmlPath: string): GhostItem[] {
    if (!existsSync(htmlPath)) {
      throw new Error(`HTML file not found: ${htmlPath}`);
    }

    const htmlContent = readFileSync(htmlPath, 'utf-8');
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;

    const items: GhostItem[] = [];
    let currentCategory = 'Other';

    // Find the main table
    const table = document.querySelector('table');
    if (!table) {
      this.warnings.push('No table found in HTML file');
      return items;
    }

    const rows = table.querySelectorAll('tbody tr');
    
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      
      if (cells.length === 1) {
        // Category header row
        const categoryText = cells[0].textContent?.trim() || '';
        currentCategory = this.extractCategory(categoryText);
        continue;
      }

      if (cells.length >= 3) {
        // Data row
        try {
          const item = this.extractItemFromRow(cells, currentCategory);
          if (item) {
            items.push(item);
          }
        } catch (error) {
          this.errors.push(`Failed to extract item from row: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    return items;
  }

  /**
   * Extract category from header text
   */
  private extractCategory(text: string): string {
    const upperText = text.toUpperCase();
    
    if (upperText.includes('OFFICIAL') || upperText.includes('TRYGHOST')) {
      return 'Official';
    } else if (upperText.includes('TOOL') || upperText.includes('RESOURCE')) {
      return 'Tool';
    } else if (upperText.includes('STARTER') || upperText.includes('DEVELOPMENT')) {
      return 'Starter';
    } else if (upperText.includes('THEME')) {
      return 'Theme';
    }
    
    return 'Theme'; // Default category
  }

  /**
   * Extract item data from table row
   */
  // eslint-disable-next-line no-undef
  private extractItemFromRow(cells: ArrayLike<Element>, category: string): GhostItem | null {
    const nameCell = cells[0];
    const urlCell = cells[1];
    const notesCell = cells[2];

    const name = nameCell.textContent?.trim();
    const urlLink = urlCell.querySelector?.('a');
    const url = urlLink?.getAttribute?.('href')?.trim();
    const notes = notesCell.textContent?.trim();

    if (!name || !url) {
      this.warnings.push(`Skipping row with missing name or URL: ${name || 'unnamed'}`);
      return null;
    }

    // Extract repository info from URL
    const repoMatch = url.match(/github\.com\/([^/]+\/[^/]+)/);
    if (!repoMatch) {
      this.warnings.push(`Invalid GitHub URL: ${url}`);
      return null;
    }

    const repo = repoMatch[1];
    const id = repo;

    // Extract star count from notes
    const starMatch = notes?.match(/(\d+(?:[.,]\d+)?)\s*k?\s*stars?/i);
    let stars = 0;
    if (starMatch) {
      const starText = starMatch[1].replace(',', '');
      stars = starText.includes('k') ? 
        Math.round(parseFloat(starText) * 1000) : 
        parseInt(starText, 10);
    }

    // Extract description from notes (everything before star count or semicolon)
    let description = notes || '';
    if (starMatch) {
      description = description.substring(0, description.indexOf(starMatch[0])).trim();
    }
    if (description.includes(';')) {
      description = description.split(';')[0].trim();
    }

    // Generate tags based on category and description
    const tags = this.generateTags(category, description, notes || '');

    // Determine confidence based on star count
    let confidence: 'high' | 'medium' | 'low' = 'low';
    if (stars > 1000) {
      confidence = 'high';
    } else if (stars > 100) {
      confidence = 'medium';
    }

    // Calculate score based on various factors
    const score = this.calculateScore(stars, category, description);

    return {
      id,
      name,
      repo,
      url,
      description: description || null,
      category,
      tags,
      stars,
      pushedAt: new Date().toISOString(), // Will be updated by crawler
      archived: false,
      fork: false,
      license: null, // Will be populated by crawler
      topics: [],
      score,
      confidence,
      notes: this.extractNotes(notes || ''),
      hidden: false
    };
  }

  /**
   * Generate tags based on content
   */
  private generateTags(category: string, description: string, notes: string): string[] {
    const tags = ['ghost-theme'];
    const content = `${description} ${notes}`.toLowerCase();

    // Add category-specific tags
    if (category === 'Official') {
      tags.push('official');
    }

    // Add feature-based tags
    if (content.includes('dark mode') || content.includes('dark-mode')) {
      tags.push('dark-mode');
    }
    if (content.includes('responsive')) {
      tags.push('responsive');
    }
    if (content.includes('minimal')) {
      tags.push('minimal');
    }
    if (content.includes('magazine')) {
      tags.push('magazine');
    }
    if (content.includes('newsletter')) {
      tags.push('newsletter');
    }
    if (content.includes('podcast')) {
      tags.push('podcast');
    }
    if (content.includes('portfolio')) {
      tags.push('portfolio');
    }
    if (content.includes('handlebars')) {
      tags.push('handlebars');
    }

    return [...new Set(tags)]; // Remove duplicates
  }

  /**
   * Calculate score based on various factors
   */
  private calculateScore(stars: number, category: string, description: string): number {
    let score = 50; // Base score

    // Star-based scoring
    if (stars > 2000) score += 30;
    else if (stars > 1000) score += 25;
    else if (stars > 500) score += 20;
    else if (stars > 100) score += 15;
    else if (stars > 50) score += 10;
    else if (stars > 10) score += 5;

    // Category bonus
    if (category === 'Official') score += 15;
    else if (category === 'Tool') score += 10;

    // Description quality bonus
    if (description && description.length > 20) score += 5;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Extract clean notes from original notes
   */
  private extractNotes(originalNotes: string): string | null {
    if (!originalNotes) return null;

    let notes = originalNotes;

    // Remove star count
    notes = notes.replace(/\d+(?:[.,]\d+)?k?\s*stars?[;,]?\s*/gi, '');
    
    // Remove common prefixes
    notes = notes.replace(/^[;,\s]+/, '');
    notes = notes.replace(/[;,\s]+$/, '');

    // Return null if notes are empty or too short
    if (!notes || notes.length < 5) {
      return null;
    }

    return notes;
  }

  /**
   * Migrate data from HTML to YAML
   */
  async migrate(htmlPath: string, outputPath: string = 'data/items.yml'): Promise<MigrationResult> {
    console.log('🔄 Starting data migration from HTML to YAML...');
    
    this.errors = [];
    this.warnings = [];

    try {
      // Extract items from HTML
      console.log(`📖 Reading HTML file: ${htmlPath}`);
      const items = this.extractFromHTML(htmlPath);
      
      console.log(`✅ Extracted ${items.length} items`);

      // Validate extracted data
      console.log('🔍 Validating extracted data...');
      const validItems = items.filter(item => {
        if (!item.id || !item.name || !item.url) {
          this.errors.push(`Invalid item: ${JSON.stringify(item)}`);
          return false;
        }
        return true;
      });

      console.log(`✅ ${validItems.length} valid items after validation`);

      // Sort items by category and stars
      validItems.sort((a, b) => {
        if (a.category !== b.category) {
          const categoryOrder = ['Official', 'Theme', 'Tool', 'Starter'];
          return categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
        }
        return b.stars - a.stars;
      });

      // Write to YAML file
      console.log(`💾 Writing to YAML file: ${outputPath}`);
      const yamlContent = yaml.dump(validItems, {
        indent: 2,
        lineWidth: 120,
        noRefs: true
      });

      writeFileSync(outputPath, yamlContent, 'utf-8');
      console.log('✅ YAML file written successfully');

      // Generate summary
      const categoryStats = validItems.reduce((stats, item) => {
        stats[item.category] = (stats[item.category] || 0) + 1;
        return stats;
      }, {} as Record<string, number>);

      console.log('\n📊 Migration Summary:');
      console.log(`   Total items: ${validItems.length}`);
      for (const [category, count] of Object.entries(categoryStats)) {
        console.log(`   ${category}: ${count}`);
      }

      if (this.warnings.length > 0) {
        console.log(`\n⚠️  ${this.warnings.length} warnings:`);
        this.warnings.slice(0, 5).forEach(warning => console.log(`   • ${warning}`));
        if (this.warnings.length > 5) {
          console.log(`   ... and ${this.warnings.length - 5} more warnings`);
        }
      }

      if (this.errors.length > 0) {
        console.log(`\n❌ ${this.errors.length} errors:`);
        this.errors.slice(0, 5).forEach(error => console.log(`   • ${error}`));
        if (this.errors.length > 5) {
          console.log(`   ... and ${this.errors.length - 5} more errors`);
        }
      }

      return {
        success: true,
        itemsFound: items.length,
        itemsMigrated: validItems.length,
        errors: this.errors,
        warnings: this.warnings
      };

    } catch (error) {
      const errorMsg = `Migration failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error('❌', errorMsg);
      this.errors.push(errorMsg);

      return {
        success: false,
        itemsFound: 0,
        itemsMigrated: 0,
        errors: this.errors,
        warnings: this.warnings
      };
    }
  }
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Le Ghost Data Migration Tool

Usage: npm run migrate [options] [input-file] [output-file]

Arguments:
  input-file    Path to HTML file to migrate (default: index.html)
  output-file   Path to output YAML file (default: data/items.yml)

Options:
  --help, -h    Show this help message

Examples:
  npm run migrate                           # Migrate index.html to data/items.yml
  npm run migrate old-index.html            # Migrate specific HTML file
  npm run migrate input.html output.yml    # Specify both input and output
`);
    process.exit(0);
  }

  const inputFile = args[0] || 'index.html';
  const outputFile = args[1] || 'data/items.yml';

  try {
    const migrator = new DataMigrator();
    const result = await migrator.migrate(inputFile, outputFile);
    
    if (result.success) {
      console.log('\n✅ Migration completed successfully!');
      console.log('\nNext steps:');
      console.log('1. Review the generated YAML file');
      console.log('2. Run `npm run validate:data` to check data integrity');
      console.log('3. Run `npm run update:dry` to test the new data');
    } else {
      console.log('\n❌ Migration failed!');
      console.log('Please check the errors above and try again.');
    }
    
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('❌ Fatal error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}