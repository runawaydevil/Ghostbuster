/**
 * GitHub API client with authentication, rate limiting, and retry logic
 */

import { Octokit } from '@octokit/rest';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface GitHubClientConfig {
  token: string;
  rateLimit: {
    requestsPerHour: number;
    backoffMultiplier: number;
  };
  cache: {
    ttl: number;
    directory: string;
  };
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  used: number;
}

export interface CacheEntry {
  data: any;
  timestamp: number;
  etag?: string;
}

/**
 * GitHub API client with built-in rate limiting and caching
 */
export class GitHubClient {
  private octokit: Octokit;
  private config: GitHubClientConfig;
  private apiCallsUsed: number = 0;
  private cacheHits: number = 0;

  constructor(config: GitHubClientConfig) {
    this.config = config;
    this.octokit = new Octokit({
      auth: config.token,
      userAgent: 'le-ghost/1.0.0',
      request: {
        retries: 0, // We'll handle retries ourselves
      }
    });

    // Ensure cache directory exists
    if (!existsSync(config.cache.directory)) {
      mkdirSync(config.cache.directory, { recursive: true });
    }
  }

  /**
   * Get current rate limit status
   */
  async getRateLimit(): Promise<RateLimitInfo> {
    try {
      const response = await this.octokit.rest.rateLimit.get();
      return {
        limit: response.data.rate.limit,
        remaining: response.data.rate.remaining,
        reset: response.data.rate.reset,
        used: response.data.rate.used
      };
    } catch (error) {
      throw new Error(`Failed to get rate limit: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Calculate delay for exponential backoff
   */
  private calculateBackoffDelay(attempt: number): number {
    const baseDelay = 1000; // 1 second
    return baseDelay * Math.pow(this.config.rateLimit.backoffMultiplier, attempt);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute API request with retry logic, rate limiting, and ETag support
   */
  private async executeWithRetry<T>(
    operation: (headers?: any) => Promise<{ data: T; headers?: any }>,
    maxRetries: number = 3,
    etag?: string
  ): Promise<{ data: T; headers?: any; notModified?: boolean }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check rate limit before making request
        const rateLimit = await this.getRateLimit();
        
        // If we're close to the limit, wait for reset
        if (rateLimit.remaining < 10) {
          const resetTime = rateLimit.reset * 1000;
          const waitTime = resetTime - Date.now() + 1000; // Add 1 second buffer
          
          if (waitTime > 0) {
            console.log(`Rate limit nearly exceeded. Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
            await this.sleep(waitTime);
          }
        }

        // Prepare headers for conditional request
        const headers: any = {};
        if (etag) {
          headers['If-None-Match'] = etag;
        }

        const result = await operation(headers);
        this.apiCallsUsed++;
        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if it's a 304 Not Modified response (content hasn't changed)
        if (lastError.message.includes('304')) {
          return { data: null as any, notModified: true };
        }

        // Check if it's a rate limit error
        if (lastError.message.includes('rate limit') || lastError.message.includes('403')) {
          const delay = this.calculateBackoffDelay(attempt);
          console.log(`Rate limit hit, backing off for ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
          await this.sleep(delay);
          continue;
        }

        // Check if it's a temporary network error
        if (lastError.message.includes('ECONNRESET') || 
            lastError.message.includes('ETIMEDOUT') ||
            lastError.message.includes('502') ||
            lastError.message.includes('503')) {
          const delay = this.calculateBackoffDelay(attempt);
          console.log(`Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
          await this.sleep(delay);
          continue;
        }

        // For other errors, don't retry
        throw lastError;
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Get cache key for a request
   */
  private getCacheKey(endpoint: string, params: any): string {
    const paramString = JSON.stringify(params, Object.keys(params).sort());
    return `${endpoint}_${Buffer.from(paramString).toString('base64')}`;
  }

  /**
   * Get cached data if valid
   */
  private getCachedData(cacheKey: string): CacheEntry | null {
    const cacheFile = join(this.config.cache.directory, `${cacheKey}.json`);
    
    if (!existsSync(cacheFile)) {
      return null;
    }

    try {
      const content = readFileSync(cacheFile, 'utf-8');
      const entry: CacheEntry = JSON.parse(content);
      
      // Check if cache is still valid
      const age = Date.now() - entry.timestamp;
      if (age > this.config.cache.ttl) {
        return null;
      }

      return entry;
    } catch (error) {
      // Invalid cache file, ignore
      return null;
    }
  }

  /**
   * Save data to cache
   */
  private setCachedData(cacheKey: string, data: any, etag?: string): void {
    const cacheFile = join(this.config.cache.directory, `${cacheKey}.json`);
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      etag
    };

    try {
      writeFileSync(cacheFile, JSON.stringify(entry, null, 2));
    } catch (error) {
      console.warn(`Failed to write cache file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Search repositories with caching, ETag support, and pagination
   */
  async searchRepositories(
    query: string,
    options: {
      sort?: 'stars' | 'forks' | 'help-wanted-issues' | 'updated';
      order?: 'asc' | 'desc';
      per_page?: number;
      page?: number;
    } = {}
  ) {
    const cacheKey = this.getCacheKey('search_repositories', { query, ...options });
    const cached = this.getCachedData(cacheKey);

    if (cached) {
      // Check if cache is still fresh
      const age = Date.now() - cached.timestamp;
      if (age < this.config.cache.ttl) {
        this.cacheHits++;
        return cached.data;
      }

      // Cache is stale, but we can use ETag for conditional request
      const result = await this.executeWithRetry(async (headers) => {
        const response = await this.octokit.rest.search.repos({
          q: query,
          sort: options.sort,
          order: options.order,
          per_page: options.per_page || 30,
          page: options.page || 1,
          headers: headers || {}
        });

        return {
          data: response.data,
          headers: response.headers
        };
      }, 3, cached.etag);

      if (result.notModified) {
        // Content hasn't changed, refresh cache timestamp
        this.setCachedData(cacheKey, cached.data, cached.etag);
        this.cacheHits++;
        return cached.data;
      }

      // Content has changed, update cache
      const etag = result.headers?.etag;
      this.setCachedData(cacheKey, result.data, etag);
      return result.data;
    }

    // No cache, make fresh request
    const result = await this.executeWithRetry(async () => {
      const response = await this.octokit.rest.search.repos({
        q: query,
        sort: options.sort,
        order: options.order,
        per_page: options.per_page || 30,
        page: options.page || 1
      });

      return {
        data: response.data,
        headers: response.headers
      };
    });

    const etag = result.headers?.etag;
    this.setCachedData(cacheKey, result.data, etag);
    return result.data;
  }

  /**
   * Get repository details with caching and ETag support
   */
  async getRepository(owner: string, repo: string) {
    const cacheKey = this.getCacheKey('get_repository', { owner, repo });
    const cached = this.getCachedData(cacheKey);

    if (cached) {
      // Check if cache is still fresh
      const age = Date.now() - cached.timestamp;
      if (age < this.config.cache.ttl) {
        this.cacheHits++;
        return cached.data;
      }

      // Cache is stale, but we can use ETag for conditional request
      const result = await this.executeWithRetry(async (headers) => {
        const response = await this.octokit.rest.repos.get({
          owner,
          repo,
          headers: headers || {}
        });

        return {
          data: response.data,
          headers: response.headers
        };
      }, 3, cached.etag);

      if (result.notModified) {
        // Content hasn't changed, refresh cache timestamp
        this.setCachedData(cacheKey, cached.data, cached.etag);
        this.cacheHits++;
        return cached.data;
      }

      // Content has changed, update cache
      const etag = result.headers?.etag;
      this.setCachedData(cacheKey, result.data, etag);
      return result.data;
    }

    // No cache, make fresh request
    const result = await this.executeWithRetry(async () => {
      const response = await this.octokit.rest.repos.get({
        owner,
        repo
      });

      return {
        data: response.data,
        headers: response.headers
      };
    });

    const etag = result.headers?.etag;
    this.setCachedData(cacheKey, result.data, etag);
    return result.data;
  }

  /**
   * Get repository README content with caching and ETag support
   */
  async getReadme(owner: string, repo: string): Promise<string | null> {
    const cacheKey = this.getCacheKey('get_readme', { owner, repo });
    const cached = this.getCachedData(cacheKey);

    if (cached) {
      // Check if cache is still fresh
      const age = Date.now() - cached.timestamp;
      if (age < this.config.cache.ttl) {
        this.cacheHits++;
        return cached.data;
      }

      // Cache is stale, but we can use ETag for conditional request
      try {
        const result = await this.executeWithRetry(async (headers) => {
          const response = await this.octokit.rest.repos.getReadme({
            owner,
            repo,
            headers: headers || {}
          });

          // Decode base64 content
          const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
          return {
            data: content,
            headers: response.headers
          };
        }, 3, cached.etag);

        if (result.notModified) {
          // Content hasn't changed, refresh cache timestamp
          this.setCachedData(cacheKey, cached.data, cached.etag);
          this.cacheHits++;
          return cached.data;
        }

        // Content has changed, update cache
        const etag = result.headers?.etag;
        this.setCachedData(cacheKey, result.data, etag);
        return result.data;
      } catch (error) {
        // README not found is not an error
        if (error instanceof Error && error.message.includes('404')) {
          this.setCachedData(cacheKey, null);
          return null;
        }
        throw error;
      }
    }

    // No cache, make fresh request
    try {
      const result = await this.executeWithRetry(async () => {
        const response = await this.octokit.rest.repos.getReadme({
          owner,
          repo
        });

        // Decode base64 content
        const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
        return {
          data: content,
          headers: response.headers
        };
      });

      const etag = result.headers?.etag;
      this.setCachedData(cacheKey, result.data, etag);
      return result.data;
    } catch (error) {
      // README not found is not an error
      if (error instanceof Error && error.message.includes('404')) {
        this.setCachedData(cacheKey, null);
        return null;
      }
      throw error;
    }
  }

  /**
   * Get repository contents (file tree) with caching and ETag support
   */
  async getContents(owner: string, repo: string, path: string = '') {
    const cacheKey = this.getCacheKey('get_contents', { owner, repo, path });
    const cached = this.getCachedData(cacheKey);

    if (cached) {
      // Check if cache is still fresh
      const age = Date.now() - cached.timestamp;
      if (age < this.config.cache.ttl) {
        this.cacheHits++;
        return cached.data;
      }

      // Cache is stale, but we can use ETag for conditional request
      try {
        const result = await this.executeWithRetry(async (headers) => {
          const response = await this.octokit.rest.repos.getContent({
            owner,
            repo,
            path,
            headers: headers || {}
          });

          return {
            data: response.data,
            headers: response.headers
          };
        }, 3, cached.etag);

        if (result.notModified) {
          // Content hasn't changed, refresh cache timestamp
          this.setCachedData(cacheKey, cached.data, cached.etag);
          this.cacheHits++;
          return cached.data;
        }

        // Content has changed, update cache
        const etag = result.headers?.etag;
        this.setCachedData(cacheKey, result.data, etag);
        return result.data;
      } catch (error) {
        // Path not found is not an error
        if (error instanceof Error && error.message.includes('404')) {
          this.setCachedData(cacheKey, null);
          return null;
        }
        throw error;
      }
    }

    // No cache, make fresh request
    try {
      const result = await this.executeWithRetry(async () => {
        const response = await this.octokit.rest.repos.getContent({
          owner,
          repo,
          path
        });

        return {
          data: response.data,
          headers: response.headers
        };
      });

      const etag = result.headers?.etag;
      this.setCachedData(cacheKey, result.data, etag);
      return result.data;
    } catch (error) {
      // Path not found is not an error
      if (error instanceof Error && error.message.includes('404')) {
        this.setCachedData(cacheKey, null);
        return null;
      }
      throw error;
    }
  }

  /**
   * Get statistics for this session
   */
  getStats() {
    return {
      apiCallsUsed: this.apiCallsUsed,
      cacheHits: this.cacheHits
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.apiCallsUsed = 0;
    this.cacheHits = 0;
  }
}