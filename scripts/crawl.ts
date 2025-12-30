/**
 * Repository discovery crawler for Ghost CMS themes
 */

import { GitHubClient, GitHubClientConfig } from './github-client.js';
import { SearchQuery, CrawlResult, RepositoryData } from './types.js';

export interface CrawlerOptions {
  maxPages?: number;
  delayBetweenQueries?: number;
  includeArchived?: boolean;
  includeForks?: boolean;
}

/**
 * Repository crawler that discovers Ghost themes using GitHub search
 */
export class RepositoryCrawler {
  private client: GitHubClient;
  private options: CrawlerOptions;

  constructor(config: GitHubClientConfig, options: CrawlerOptions = {}) {
    this.client = new GitHubClient(config);
    this.options = {
      maxPages: 10,
      delayBetweenQueries: 1000,
      includeArchived: false,
      includeForks: true,
      ...options
    };
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Extract owner and repo from full_name
   */
  private parseRepoName(fullName: string): { owner: string; repo: string } {
    const [owner, repo] = fullName.split('/');
    return { owner, repo };
  }

  /**
   * Enrich repository data with additional metadata
   */
  private async enrichRepositoryData(repo: any): Promise<RepositoryData> {
    const { owner, repo: repoName } = this.parseRepoName(repo.full_name);

    try {
      // Get detailed repository information
      const detailedRepo = await this.client.getRepository(owner, repoName);

      return {
        id: repo.id.toString(),
        name: repo.name,
        full_name: repo.full_name,
        html_url: repo.html_url,
        description: repo.description,
        stargazers_count: repo.stargazers_count,
        pushed_at: repo.pushed_at,
        archived: repo.archived || false,
        fork: repo.fork || false,
        license: repo.license ? { key: repo.license.key } : null,
        topics: detailedRepo.topics || [],
        owner: {
          login: repo.owner.login
        }
      };
    } catch (error) {
      console.warn(`Failed to enrich data for ${repo.full_name}: ${error instanceof Error ? error.message : String(error)}`);
      
      // Return basic data if enrichment fails
      return {
        id: repo.id.toString(),
        name: repo.name,
        full_name: repo.full_name,
        html_url: repo.html_url,
        description: repo.description,
        stargazers_count: repo.stargazers_count,
        pushed_at: repo.pushed_at,
        archived: repo.archived || false,
        fork: repo.fork || false,
        license: repo.license ? { key: repo.license.key } : null,
        topics: [],
        owner: {
          login: repo.owner.login
        }
      };
    }
  }

  /**
   * Filter repositories based on crawler options
   */
  private shouldIncludeRepository(repo: any): boolean {
    // Filter archived repositories
    if (!this.options.includeArchived && repo.archived) {
      return false;
    }

    // Filter forks
    if (!this.options.includeForks && repo.fork) {
      return false;
    }

    return true;
  }

  /**
   * Execute a single search query with pagination
   */
  private async executeSearchQuery(
    query: SearchQuery,
    errors: string[]
  ): Promise<RepositoryData[]> {
    const repositories: RepositoryData[] = [];
    const seenRepos = new Set<string>();
    let page = 1;
    let totalFound = 0;

    console.log(`Executing search query: "${query.query}"`);

    try {
      while (page <= (this.options.maxPages || 10)) {
        console.log(`  Fetching page ${page}...`);

        const searchResult = await this.client.searchRepositories(query.query, {
          sort: 'stars',
          order: 'desc',
          per_page: 100, // Maximum allowed by GitHub
          page
        });

        if (!searchResult.items || searchResult.items.length === 0) {
          console.log(`  No more results found on page ${page}`);
          break;
        }

        totalFound = searchResult.total_count;
        console.log(`  Found ${searchResult.items.length} repositories on page ${page} (${totalFound} total)`);

        for (const repo of searchResult.items) {
          // Skip duplicates
          if (seenRepos.has(repo.full_name)) {
            continue;
          }
          seenRepos.add(repo.full_name);

          // Apply filters
          if (!this.shouldIncludeRepository(repo)) {
            continue;
          }

          // Apply minimum stars filter
          if (repo.stargazers_count < query.minStars) {
            continue;
          }

          try {
            const enrichedRepo = await this.enrichRepositoryData(repo);
            repositories.push(enrichedRepo);

            // Stop if we've reached the maximum results for this query
            if (repositories.length >= query.maxResults) {
              console.log(`  Reached maximum results (${query.maxResults}) for this query`);
              return repositories;
            }
          } catch (error) {
            errors.push(`Failed to process ${repo.full_name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        // If we got fewer results than requested, we've reached the end
        if (searchResult.items.length < 100) {
          console.log(`  Reached end of results on page ${page}`);
          break;
        }

        page++;

        // Add delay between pages to be respectful to the API
        if (page <= (this.options.maxPages || 10)) {
          await this.sleep(500);
        }
      }

      console.log(`  Collected ${repositories.length} repositories from query`);
      return repositories;

    } catch (error) {
      const errorMessage = `Search query "${query.query}" failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMessage);
      console.error(`  ${errorMessage}`);
      return [];
    }
  }

  /**
   * Crawl repositories using multiple search queries
   */
  async crawl(queries: SearchQuery[]): Promise<CrawlResult> {
    console.log(`Starting crawl with ${queries.length} search queries`);
    
    const allRepositories: RepositoryData[] = [];
    const seenRepos = new Set<string>();
    const errors: string[] = [];

    this.client.resetStats();

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      
      try {
        const repositories = await this.executeSearchQuery(query, errors);

        // Deduplicate across queries
        for (const repo of repositories) {
          if (!seenRepos.has(repo.full_name)) {
            seenRepos.add(repo.full_name);
            allRepositories.push(repo);
          }
        }

        // Add delay between queries
        if (i < queries.length - 1 && this.options.delayBetweenQueries) {
          console.log(`Waiting ${this.options.delayBetweenQueries}ms before next query...`);
          await this.sleep(this.options.delayBetweenQueries);
        }

      } catch (error) {
        const errorMessage = `Query ${i + 1} failed: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMessage);
        console.error(errorMessage);
      }
    }

    const stats = this.client.getStats();
    
    console.log(`Crawl completed:`);
    console.log(`  Total repositories found: ${allRepositories.length}`);
    console.log(`  API calls used: ${stats.apiCallsUsed}`);
    console.log(`  Cache hits: ${stats.cacheHits}`);
    console.log(`  Errors: ${errors.length}`);

    return {
      repositories: allRepositories,
      apiCallsUsed: stats.apiCallsUsed,
      cacheHits: stats.cacheHits,
      errors
    };
  }

  /**
   * Get additional metadata for a repository (README, file structure)
   */
  async getRepositoryMetadata(repo: RepositoryData): Promise<{
    readme: string | null;
    hasHandlebarsFiles: boolean;
    hasPackageJson: boolean;
    hasGhostThemeFiles: boolean;
  }> {
    const { owner, repo: repoName } = this.parseRepoName(repo.full_name);

    try {
      // Get README content
      const readme = await this.client.getReadme(owner, repoName);

      // Check for Ghost theme indicators in file structure
      const rootContents = await this.client.getContents(owner, repoName);
      
      let hasHandlebarsFiles = false;
      let hasPackageJson = false;
      let hasGhostThemeFiles = false;

      if (Array.isArray(rootContents)) {
        const fileNames = rootContents.map(item => item.name.toLowerCase());
        
        hasPackageJson = fileNames.includes('package.json');
        hasGhostThemeFiles = fileNames.includes('index.hbs') || 
                           fileNames.includes('post.hbs') || 
                           fileNames.includes('default.hbs');

        // Check for .hbs files in root or partials directory
        hasHandlebarsFiles = fileNames.some(name => name.endsWith('.hbs'));
        
        // Also check partials directory if it exists
        if (fileNames.includes('partials')) {
          try {
            const partialsContents = await this.client.getContents(owner, repoName, 'partials');
            if (Array.isArray(partialsContents)) {
              const partialsFiles = partialsContents.map(item => item.name.toLowerCase());
              hasHandlebarsFiles = hasHandlebarsFiles || partialsFiles.some(name => name.endsWith('.hbs'));
            }
          } catch (error) {
            // Ignore errors when checking partials directory
          }
        }
      }

      return {
        readme,
        hasHandlebarsFiles,
        hasPackageJson,
        hasGhostThemeFiles
      };

    } catch (error) {
      console.warn(`Failed to get metadata for ${repo.full_name}: ${error instanceof Error ? error.message : String(error)}`);
      return {
        readme: null,
        hasHandlebarsFiles: false,
        hasPackageJson: false,
        hasGhostThemeFiles: false
      };
    }
  }

  /**
   * Get current rate limit status
   */
  async getRateLimit() {
    return this.client.getRateLimit();
  }

  /**
   * Get crawler statistics
   */
  getStats() {
    return this.client.getStats();
  }
}

/**
 * Create a crawler instance with configuration
 */
export function createCrawler(config: GitHubClientConfig, options?: CrawlerOptions): RepositoryCrawler {
  return new RepositoryCrawler(config, options);
}